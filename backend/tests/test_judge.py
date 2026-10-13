import asyncio

import pytest

from app.agent.prompt import SYSTEM_PROMPT
from app.llm.base import Prices, ToolCall
from evals.judge import (
    CRITERIA, SYSTEM, VERDICT_TOOL, agreement, cohen_kappa, judge_turn, parse_verdicts, results_items, summarize_verdicts,
    turn_text,
)
from evals.turn_view import INFO
from tests.test_loop import ScriptedProvider, reply
from tests.test_tools import PORTABLE_KEYS

FIELDS = {name: f"<{name}>" for name in INFO}


def verdict_args(**overrides):
    args = {key: {"verdict": "pass", "reason": "fine"} for key in CRITERIA}
    return {**args, **{k: {"verdict": v, "reason": "why"} for k, v in overrides.items()}}


def verdict_call(**overrides):
    return reply(stop="tool_use", calls=[ToolCall("j1", "record_verdicts", verdict_args(**overrides))])


def test_the_judge_reads_the_rubric_but_never_the_agent_prompt():
    assert "## Judge rubric" in SYSTEM and "D4, the length limit" in SYSTEM and "Labeling guide" not in SYSTEM
    assert SYSTEM_PROMPT not in SYSTEM


def test_the_verdict_tool_has_a_portable_schema():
    def keys(schema):
        found = set(schema)
        for value in schema.get("properties", {}).values():
            found |= keys(value)
        return found

    assert keys(VERDICT_TOOL.parameters) <= PORTABLE_KEYS
    assert VERDICT_TOOL.parameters["required"] == list(CRITERIA)


def test_a_turn_is_judged_from_one_tool_call_and_costed():
    provider = ScriptedProvider(verdict_call(faithfulness="fail"))
    provider.prices = Prices(input=1_000_000, output=0, cache_read=0, cache_write=0)  # $1 per input token
    result = asyncio.run(judge_turn(provider, FIELDS))
    assert result["verdicts"]["Faithfulness"] == {"verdict": "fail", "reason": "why"}
    assert result["verdicts"]["Relevance"]["verdict"] == "pass" and result["cost_usd"] == 100
    [call] = provider.calls
    assert call["tools"] == [VERDICT_TOOL] and call["system"] == SYSTEM
    assert call["history"] == [{"user": turn_text(FIELDS)}] and all(f"## {name}\n<{name}>" in turn_text(FIELDS) for name in INFO)


@pytest.mark.parametrize(
    ("responses", "judged"),
    [
        ([reply("I think it passes."), verdict_call()], True),  # no tool call: retried once
        ([verdict_call(relevance="maybe"), verdict_call()], True),  # an unknown verdict: retried once
        ([reply("no"), reply("still no")], False),  # recorded as an error after the retry
    ],
)
def test_an_invalid_answer_is_retried_once(responses, judged):
    result = asyncio.run(judge_turn(ScriptedProvider(*responses), FIELDS))
    assert ("verdicts" in result) is judged and ("error" in result) is not judged


def test_parse_verdicts_needs_every_criterion():
    args = verdict_args()
    del args["decline_quality"]
    assert parse_verdicts(args) is None and parse_verdicts(verdict_args()) is not None


def test_summary_counts_pass_rates_only_where_a_criterion_applies():
    def judged(**v):
        return {"verdicts": parse_verdicts(verdict_args(**v)), "cost_usd": 0.5}

    summary = summarize_verdicts({
        "a": judged(decline_quality="n/a"), "b": judged(decline_quality="n/a", helpfulness="fail"),
        "c": {"error": "x", "cost_usd": 0.25},
    })
    assert summary["turns"] == 3 and summary["errors"] == 1 and summary["cost_usd"] == 1.25
    assert summary["criteria"]["Decline quality"] == {"applies": 0, "pass_rate": None}
    assert summary["criteria"]["Helpfulness"] == {"applies": 2, "pass_rate": 0.5}
    assert summary["turn_pass_rate"] == 0.5


def test_cohen_kappa_matches_a_hand_computed_example():
    # Observed agreement 0.8; both raters say pass 0.6 and fail 0.4 of the time, so chance agreement is 0.52.
    pairs = [("pass", "pass")] * 5 + [("fail", "fail")] * 3 + [("pass", "fail"), ("fail", "pass")]
    assert cohen_kappa(pairs) == round((0.8 - 0.52) / (1 - 0.52), 3)
    assert cohen_kappa([]) is None and cohen_kappa([("pass", "pass")]) == 1.0


def test_agreement_separates_false_passes_from_false_fails_and_skips_missing_labels():
    human = {"T1": {"Relevance": "fail"}, "T2": {"Relevance": "pass"}, "T3": {"Relevance": "n/a"}, "T4": {"Relevance": None}}
    judge = {"T1": {"Relevance": "pass"}, "T2": {"Relevance": "fail"}, "T3": {"Relevance": "pass"}, "T4": {"Relevance": "pass"}}
    report = agreement(human, judge)["Relevance"]
    assert (report["rows"], report["agreement"], report["false_pass"], report["false_fail"], report["na_mismatch"]) == (3, 0.0, 1, 1, 1)


def test_a_results_file_turn_is_rendered_with_its_history_and_tool_calls():
    rows = {"J1": {"id": "J1", "title": "Warm Jacket", "brand": "B", "price": 1000, "mrp": 1500, "rating": 4.2, "review_count": 10,
                   "sizes": ["L"], "colors": ["black"], "attributes": {"waterproof": True}, "in_stock": True}}
    search = {"name": "search_products", "arguments": {"query": "warm"}, "is_error": False,
              "result": {"ids": ["J1"], "total_matches": 1, "applied": {"category": "jackets", "price_max": 3000}, "warnings": []}}
    first = {"user": "warm jacket under 3k", "reply": "Here you go.", "shown": ["J1"], "tool_calls": [search]}
    second = {"user": "is it waterproof?", "reply": "Yes, it is.", "shown": None, "tool_calls": []}
    items = results_items({"cases": [{"id": "c", "turns": [first, second]}]}, rows)
    assert list(items) == ["c#1", "c#2"]
    assert "price ≤ ₹3,000" in items["c#1"]["What the agent did"] and "1 matches, 1 returned" in items["c#1"]["What the agent did"]
    assert items["c#1"]["Products shown"].startswith("1. Warm Jacket | B | ₹1,000 (MRP ₹1,500)")
    assert "User: warm jacket under 3k" in items["c#2"]["Earlier conversation"] and items["c#2"]["Products shown"] == "(none)"
    with pytest.raises(SystemExit):  # a run from before tool calls were stored can't be judged
        results_items({"cases": [{"id": "c", "turns": [{"user": "x", "reply": "y", "shown": None}]}]}, rows)
