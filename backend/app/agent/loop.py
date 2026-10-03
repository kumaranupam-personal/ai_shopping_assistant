"""Runs one user turn against the LLM interface (docs/04-agent.md, Turn loop)."""

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from app import tracing
from app.agent.prompt import PROMPT_VERSION, SYSTEM_PROMPT
from app.agent.session import Turn
from app.agent.tools import TOOL_SPECS, TurnContext, current, execute, status_text
from app.llm.base import LLMProvider, Usage
from app.search.index import SearchIndex

MAX_MODEL_CALLS = 8
REFUSAL_MESSAGE = "Sorry, I can't help with that request. I'm happy to help you find something else in the store."


class TurnLimitError(Exception):
    """The turn hit the model-call limit, or a response hit the output-token limit."""


@dataclass
class TurnRecord:
    turn: int = 0
    calls: list[tuple[float, Usage]] = field(default_factory=list)  # (latency in seconds, usage) per model call


async def run_turn(
    provider: LLMProvider,
    index: SearchIndex,
    turn: Turn,
    text: str,
    emit: Callable[[str, dict], None],
    options: tracing.TraceOptions,
) -> TurnRecord:
    """Runs a started turn (`SessionStore.begin_turn`) and commits it. Any failure or cancellation rolls it back and re-raises.

    The turn is traced as one root span with a span per model call and per tool call (docs/10-observability.md).
    """
    history, record, texts = turn.session.history, TurnRecord(), []

    def send(event: str, data: dict) -> None:  # every event of the turn; its texts are also the trace's output
        if event == "text":
            texts.append(data["text"])
        emit(event, data)

    def say(part: str) -> None:
        send("text", {"text": part})
        turn.transcript.append({"type": "assistant", "text": part})

    def finish() -> TurnRecord:
        turn.commit()
        record.turn = turn.session.turn_count
        return record

    token = current.set(TurnContext(index, turn, send))
    root_attributes = {
        "langfuse.trace.name": "turn",
        "langfuse.session.id": turn.session.id,
        "langfuse.trace.tags": [*options.tags, provider.name],  # the provider, so a trace shows it at a glance
        "langfuse.version": PROMPT_VERSION,
        "langfuse.trace.metadata.turn": turn.session.turn_count + 1,
        "langfuse.trace.metadata.provider": provider.name,
        **tracing.text_attributes(options, input=text),
    }
    with tracing.span("turn", root_attributes, root=True) as root:
        try:
            history.append(provider.user_message(text))
            turn.transcript.append({"type": "user", "text": text})
            for _ in range(MAX_MODEL_CALLS):
                with tracing.span("model call", {"langfuse.observation.type": "generation", "gen_ai.request.model": provider.model}) as span:
                    started = time.perf_counter()
                    response = await provider.complete(SYSTEM_PROMPT, history, TOOL_SPECS)
                    record.calls.append((time.perf_counter() - started, response.usage))
                    calls = [{"name": call.name, "arguments": call.arguments} for call in response.tool_calls]
                    span.set_attributes({
                        **tracing.usage_attributes(response.usage, provider.prices),
                        "langfuse.observation.metadata.stop_reason": response.stop_reason,
                        **tracing.text_attributes(options, output={"text": response.text, "tool_calls": calls}),
                    })
                history.append(response.native_message)
                # With show_products the reply arrives in its `reply`; other text alongside it is the model thinking aloud.
                if not any(call.name == "show_products" for call in response.tool_calls):
                    for part in response.text:
                        say(part)
                if response.stop_reason == "max_tokens":
                    raise TurnLimitError("a model response hit the output-token limit")
                if response.stop_reason == "refusal":
                    say(REFUSAL_MESSAGE)
                if response.stop_reason != "tool_use" or not response.tool_calls:
                    return finish()
                results, shown_before = [], turn.shown_ids
                for call in response.tool_calls:
                    if status := status_text(call.name, call.arguments):
                        send("status", {"text": status})
                    with tracing.span(call.name, {"langfuse.observation.type": "tool", **tracing.text_attributes(options, input=call.arguments)}) as span:
                        result = execute(call)
                        tracing.record_tool_result(span, call.name, result, options)
                    results.append(result)
                history.append(provider.tool_results_message(results))
                # The reply came in show_products, whose result holds nothing the model still needs. show_products sets a
                # new shown list only when it displays cards, so a changed list means this response showed them.
                if turn.shown_ids is not shown_before and all(call.name == "show_products" for call in response.tool_calls):
                    return finish()
            raise TurnLimitError(f"the turn reached {MAX_MODEL_CALLS} model calls")
        except BaseException:  # includes cancellation when the client disconnects
            turn.rollback()
            raise
        finally:
            root.set_attributes(tracing.text_attributes(options, output="\n".join(texts)))
            current.reset(token)
