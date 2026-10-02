"""Runs one user turn against the LLM interface (docs/04-agent.md, Turn loop)."""

import time
from collections.abc import Callable
from dataclasses import dataclass, field

from app.agent.prompt import SYSTEM_PROMPT
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
) -> TurnRecord:
    """Runs a started turn (`SessionStore.begin_turn`) and commits it. Any failure or cancellation rolls it back and re-raises."""
    history, record = turn.session.history, TurnRecord()
    token = current.set(TurnContext(index, turn, emit))

    def say(part: str) -> None:
        emit("text", {"text": part})
        turn.transcript.append({"type": "assistant", "text": part})

    try:
        history.append(provider.user_message(text))
        turn.transcript.append({"type": "user", "text": text})
        for _ in range(MAX_MODEL_CALLS):
            started = time.perf_counter()
            response = await provider.complete(SYSTEM_PROMPT, history, TOOL_SPECS)
            record.calls.append((time.perf_counter() - started, response.usage))
            history.append(response.native_message)
            for part in response.text:
                say(part)
            if response.stop_reason == "max_tokens":
                raise TurnLimitError("a model response hit the output-token limit")
            if response.stop_reason == "refusal":
                say(REFUSAL_MESSAGE)
            if response.stop_reason != "tool_use" or not response.tool_calls:
                turn.commit()
                record.turn = turn.session.turn_count
                return record
            results = []
            for call in response.tool_calls:
                if status := status_text(call.name, call.arguments):
                    emit("status", {"text": status})
                results.append(execute(call))
            history.append(provider.tool_results_message(results))
        raise TurnLimitError(f"the turn reached {MAX_MODEL_CALLS} model calls")
    except BaseException:  # includes cancellation when the client disconnects
        turn.rollback()
        raise
    finally:
        current.reset(token)
