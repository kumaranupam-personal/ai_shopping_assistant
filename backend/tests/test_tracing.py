import asyncio
import json
from types import SimpleNamespace

import pytest
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from app import tracing
from app.agent.loop import TurnLimitError, run_turn
from app.agent.prompt import PROMPT_VERSION
from app.agent.session import SessionStore
from app.config import Settings
from app.llm.base import LLMUpstreamError, Prices, ToolCall
from app.tracing import TraceOptions
from evals.run import Case, run_case
from tests.test_api import BlockingProvider
from tests.test_loop import SEARCH, SHOW, ScriptedProvider, reply

ENDPOINT = "https://cloud.langfuse.com/api/public/otel"
OFF = TraceOptions(["api"], message_text=False)


@pytest.fixture
def traced(monkeypatch):
    """Tracing set up from settings, exporting to memory; `spans()` returns the finished spans in start order."""
    exporter, created = InMemorySpanExporter(), {}
    monkeypatch.setattr(tracing, "OTLPSpanExporter", lambda **kwargs: created.update(kwargs) or exporter)
    headers = "Authorization=Basic%20cGs6c2s=,x-langfuse-ingestion-version=4"  # percent-encoded, and "=" inside a value
    provider = tracing.setup_tracing(Settings(_env_file=None, otel_exporter_otlp_endpoint=ENDPOINT, otel_exporter_otlp_headers=headers))

    def spans():
        provider.force_flush()
        return sorted(exporter.get_finished_spans(), key=lambda span: span.start_time)

    yield SimpleNamespace(created=created, spans=spans)
    tracing.shutdown_tracing(provider)


def turn(provider, index, options=OFF, text="warm jacket under 3k"):
    store = SessionStore(ttl_minutes=60, max_turns=30)
    session = store.create("scripted")
    asyncio.run(run_turn(provider, index, store.begin_turn(session.id), text, lambda *event: None, options))
    return session


def attributes(span) -> dict:
    """A span's attributes with JSON strings decoded."""
    return {key: json.loads(value) if key.endswith("_details") else value for key, value in span.attributes.items()}


def test_the_exporter_sends_to_the_configured_endpoint_with_its_headers(traced):
    assert traced.created == {
        "endpoint": f"{ENDPOINT}/v1/traces",
        "headers": {"Authorization": "Basic cGs6c2s=", "x-langfuse-ingestion-version": "4"},
    }


def test_a_turn_is_a_root_span_with_a_span_per_model_and_tool_call(traced, index):
    session = turn(ScriptedProvider(reply("Let me look.", stop="tool_use", calls=[SEARCH]), reply(stop="tool_use", calls=[SHOW])), index)
    root, *children = traced.spans()
    assert [span.name for span in children] == ["model call", "search_products", "model call", "show_products"]
    assert all(span.parent.span_id == root.context.span_id for span in children)
    # With message text off, no attribute holds a message, reply, tool argument or tool result.
    assert attributes(root) == {
        "langfuse.trace.name": "turn", "langfuse.session.id": session.id, "langfuse.trace.tags": ("api", "scripted"),
        "langfuse.version": PROMPT_VERSION, "langfuse.trace.metadata.turn": 1,
        "langfuse.trace.metadata.provider": "scripted", "langfuse.trace.metadata.outcome": "done",
    }
    assert root.status.status_code == StatusCode.UNSET
    assert attributes(children[0]) == {  # no cost: the scripted model has no prices
        "langfuse.observation.type": "generation", "gen_ai.request.model": "scripted",
        "langfuse.observation.usage_details": {"input": 100, "output": 20, "cache_read_input_tokens": 80, "cache_creation_input_tokens": 0},
        "langfuse.observation.metadata.stop_reason": "tool_use",
    }
    assert attributes(children[1]) == {"langfuse.observation.type": "tool", "langfuse.observation.metadata.total_matches": 2}
    assert attributes(children[3]) == {"langfuse.observation.type": "tool", "langfuse.observation.metadata.shown": 2}


def test_message_text_and_cost_are_recorded_when_available(traced, index):
    provider = ScriptedProvider(reply("Let me look.", stop="tool_use", calls=[SEARCH]), reply(stop="tool_use", calls=[SHOW]))
    provider.prices = Prices(input=1, output=2, cache_read=0.5, cache_write=4)
    turn(provider, index, TraceOptions(["cli"], message_text=True))
    root, model, search, _, show = traced.spans()
    assert root.attributes["langfuse.observation.input"] == "warm jacket under 3k"
    assert root.attributes["langfuse.observation.output"] == "Let me look.\nHere are 2 warm jackets."  # every text event
    assert json.loads(model.attributes["langfuse.observation.output"]) == {
        "text": ["Let me look."], "tool_calls": [{"name": "search_products", "arguments": SEARCH.arguments}],
    }
    # Usage(100, 20, 80, 0): 100 x $1, 20 x $2, 80 x $0.50 and 0 x $4 per million tokens.
    assert attributes(model)["langfuse.observation.cost_details"] == pytest.approx(
        {"input": 100e-6, "output": 40e-6, "cache_read_input_tokens": 40e-6, "cache_creation_input_tokens": 0, "total": 180e-6}
    )
    assert json.loads(search.attributes["langfuse.observation.input"]) == SEARCH.arguments
    assert json.loads(search.attributes["langfuse.observation.output"])["total_matches"] == 2
    assert json.loads(show.attributes["langfuse.observation.output"])["shown"][0]["id"] == "J3"


@pytest.mark.parametrize(
    ("responses", "error", "failed_call"),
    [
        ([reply(stop="tool_use", calls=[SEARCH]), LLMUpstreamError("down")], LLMUpstreamError, 1),
        ([reply("Partial", stop="max_tokens")], TurnLimitError, None),
    ],
    ids=["provider failure", "output limit"],
)
def test_a_failed_turn_ends_with_its_exception_as_the_outcome(traced, index, responses, error, failed_call):
    with pytest.raises(error):
        turn(ScriptedProvider(*responses), index)
    root, *children = traced.spans()
    assert root.attributes["langfuse.trace.metadata.outcome"] == error.__name__
    assert (root.status.status_code, root.status.description) == (StatusCode.ERROR, error.__name__)
    calls = [span for span in children if span.name == "model call"]
    failed = [n for n, span in enumerate(calls) if span.status.status_code == StatusCode.ERROR]
    assert failed == ([] if failed_call is None else [failed_call])  # only a call that raised is an error
    if failed_call is not None:
        assert calls[failed_call].status.description == error.__name__


def test_a_cancelled_turn_ends_as_cancelled(traced, index):
    store = SessionStore(ttl_minutes=60, max_turns=30)
    session = store.create("scripted")

    async def cancel_while_waiting_for_the_model():
        task = asyncio.create_task(run_turn(BlockingProvider(), index, store.begin_turn(session.id), "hi", lambda *e: None, OFF))
        await asyncio.sleep(0)  # the turn reaches the model call
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(cancel_while_waiting_for_the_model())
    root, model = traced.spans()
    assert root.attributes["langfuse.trace.metadata.outcome"] == "cancelled"
    assert [(span.status.status_code, span.status.description) for span in (root, model)] == [(StatusCode.ERROR, "cancelled")] * 2


def test_a_tool_error_result_marks_only_its_span(traced, index):
    unknown = ToolCall("c9", "nope", {})
    turn(ScriptedProvider(reply(stop="tool_use", calls=[unknown]), reply("Sorry, that didn't work.")), index)
    root, _, tool, _ = traced.spans()
    assert (tool.name, tool.status.status_code, tool.status.description) == ("nope", StatusCode.ERROR, "ValueError: unknown tool 'nope'")
    assert root.attributes["langfuse.trace.metadata.outcome"] == "done"


def test_eval_turns_are_tagged_with_their_case_and_always_carry_message_text(traced, index):
    case = Case(id="refine-brand", description="d", turns=["hi"])
    asyncio.run(run_case(ScriptedProvider(reply("Hello! What are you shopping for?")), index, [], case, Settings(_env_file=None)))
    root, _ = traced.spans()
    assert root.attributes["langfuse.trace.tags"] == ("eval", "refine-brand", "scripted")  # the provider comes last
    assert root.attributes["langfuse.observation.input"] == "hi"  # although TRACE_MESSAGE_TEXT is off


def test_without_an_endpoint_nothing_is_set_up(monkeypatch, index):
    monkeypatch.setattr(tracing, "OTLPSpanExporter", lambda **kwargs: pytest.fail("no exporter without an endpoint"))
    assert tracing.setup_tracing(Settings(_env_file=None)) is None
    turn(ScriptedProvider(reply("Hi there.")), index)  # spans are no-ops


def test_a_failing_exporter_never_fails_a_turn(monkeypatch, index):
    attempts = []

    class FailingExporter(InMemorySpanExporter):
        def export(self, spans):
            attempts.append(len(spans))
            raise ConnectionError("the trace backend is down")

    monkeypatch.setattr(tracing, "OTLPSpanExporter", lambda **kwargs: FailingExporter())
    provider = tracing.setup_tracing(Settings(_env_file=None, otel_exporter_otlp_endpoint=ENDPOINT))
    session = turn(ScriptedProvider(reply("Hi there.")), index)
    tracing.shutdown_tracing(provider)  # exports the batch, which fails without raising
    assert session.turn_count == 1 and attempts == [2]  # the turn and its model call were sent, and the failure dropped
