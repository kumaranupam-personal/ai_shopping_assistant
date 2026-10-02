import asyncio
import json

import pytest

from app.agent.loop import MAX_MODEL_CALLS, REFUSAL_MESSAGE, TurnLimitError, run_turn
from app.agent.prompt import SYSTEM_PROMPT
from app.agent.session import SessionStore
from app.agent.tools import TOOL_SPECS
from app.catalog.taxonomy import CATEGORIES
from app.llm.base import LLMResponse, LLMUpstreamError, ToolCall, Usage


class ScriptedProvider:
    """Returns prepared responses in order and records what each call received."""

    name = "scripted"

    def __init__(self, *responses):
        self.responses, self.calls = list(responses), []

    async def complete(self, system, history, tools):
        self.calls.append({"system": system, "history": list(history), "tools": tools})
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def user_message(self, text):
        return {"user": text}

    def tool_results_message(self, results):
        return {"results": [(r.call_id, json.loads(r.content) if not r.is_error else "error") for r in results]}


def reply(*text, stop="end_turn", calls=()):
    native = {"assistant": list(text), "calls": [c.id for c in calls]}
    return LLMResponse(list(text), list(calls), stop, native, Usage(100, 20, 80))


SEARCH = ToolCall("c1", "search_products", {"query": "warm jacket", "category": "jackets", "price_max": 3000})
SHOW = ToolCall("c2", "show_products", {"product_ids": ["J3", "J1"], "headline": "Warm jackets", "reply": "Here are 2 warm jackets."})


@pytest.fixture
def store():
    return SessionStore(ttl_minutes=60, max_turns=30)


def run(provider, index, store, session, text="warm jacket under 3k"):
    events = []
    turn = store.begin_turn(session.id)
    record = asyncio.run(run_turn(provider, index, turn, text, lambda *e: events.append(e)))
    return record, events


def test_tools_run_in_order_and_the_turn_commits(index, store):
    session = store.create("scripted")
    provider = ScriptedProvider(
        reply("Let me look.", stop="tool_use", calls=[SEARCH]),
        reply("Prioritize warmth: 4429, 4619.", stop="tool_use", calls=[SHOW]),  # dropped: the reply comes in SHOW
    )
    record, events = run(provider, index, store, session)

    assert [e for e, _ in events] == ["text", "status", "products", "text"]
    assert events[1][1] == {"text": "Searching jackets under ₹3,000"}  # status before the tool, none for show_products
    assert session.history[0] == {"user": "warm jacket under 3k"}
    # Showing the cards ends the turn: no third model call, and the cards' tool result closes the history.
    assert [list(m) for m in session.history] == [["user"], ["assistant", "calls"], ["results"], ["assistant", "calls"], ["results"]]
    assert session.history[2]["results"][0][1]["total_matches"] == 2  # search ran against the catalog
    assert session.transcript == [
        {"type": "user", "text": "warm jacket under 3k"},
        {"type": "assistant", "text": "Let me look."},
        {"type": "products", "headline": "Warm jackets", "suggestions": [], "product_ids": ["J3", "J1"]},
        {"type": "assistant", "text": "Here are 2 warm jackets."},
    ]
    assert (session.shown_ids, session.turn_count, session.busy) == (["J3", "J1"], 1, False)
    assert record.turn == 1 and [usage for _, usage in record.calls] == [Usage(100, 20, 80)] * 2
    # Every call gets the same static prompt and tool list, so providers can cache them.
    assert {c["system"] for c in provider.calls} == {SYSTEM_PROMPT}
    assert all(c["tools"] == TOOL_SPECS for c in provider.calls)


def test_a_show_that_displays_nothing_lets_the_model_continue(index, store):
    session = store.create("scripted")
    unknown = ToolCall("c3", "show_products", {"product_ids": ["NOPE"], "headline": "x", "reply": "Here they are."})
    provider = ScriptedProvider(reply(stop="tool_use", calls=[unknown]), reply("Sorry, I couldn't find those."))
    _, events = run(provider, index, store, session)
    assert len(provider.calls) == 2 and events == [("text", {"text": "Sorry, I couldn't find those."})]


def test_refusal_ends_the_turn_with_a_polite_message(index, store):
    session = store.create("scripted")
    _, events = run(ScriptedProvider(reply(stop="refusal")), index, store, session)
    assert events == [("text", {"text": REFUSAL_MESSAGE})]
    assert session.transcript[-1] == {"type": "assistant", "text": REFUSAL_MESSAGE} and session.turn_count == 1


@pytest.mark.parametrize(
    ("responses", "error"),
    [
        ([reply(stop="tool_use", calls=[SEARCH])] * MAX_MODEL_CALLS, TurnLimitError),
        ([reply("Partial", stop="max_tokens", calls=[SEARCH])], TurnLimitError),
        ([reply(stop="tool_use", calls=[SEARCH]), LLMUpstreamError("overloaded")], LLMUpstreamError),
    ],
    ids=["call limit", "output limit", "provider failure"],
)
def test_failed_turns_roll_back(index, store, responses, error):
    session = store.create("scripted")
    run(ScriptedProvider(reply("Hi there.")), index, store, session, text="hi")  # an earlier committed turn
    with pytest.raises(error):
        run(ScriptedProvider(*responses), index, store, session)
    assert session.history == [{"user": "hi"}, {"assistant": ["Hi there."], "calls": []}]
    assert session.transcript == [{"type": "user", "text": "hi"}, {"type": "assistant", "text": "Hi there."}]
    assert (session.turn_count, session.busy) == (1, False)


def test_system_prompt_lists_every_category():
    assert all(name in SYSTEM_PROMPT for name in CATEGORIES)
