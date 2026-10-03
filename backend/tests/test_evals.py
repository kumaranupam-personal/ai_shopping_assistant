import asyncio
import json

import pytest

from app.config import Settings
from app.llm.base import Prices, ToolCall, Usage
from app.search.engine import Filters, matching_ids
from evals.checks import TurnResult, expect_failures, grounding_violations, reply_language, rupee_amounts, tool_facts, user_amounts
from evals.run import EVALS_DIR, Case, cache_misses, git_state, load_cases, prompt_snapshot, prompt_version, run_case, summarize
from tests.test_loop import SEARCH, ScriptedProvider, reply


@pytest.mark.parametrize(
    ("text", "amounts"),
    [("₹7,499 and ₹1,24,999", [7499, 124999]), ("Rs. 7499 or Rs 899", [7499, 899]), ("about 7,499 rupees", [7499]),
     ("under ₹8k", [8000]), ("8 GB RAM, size 9", [])],
)
def test_rupee_amounts(text, amounts):
    assert rupee_amounts(text) == amounts


@pytest.mark.parametrize(
    ("text", "amount"),
    [("jacket under 8k", 8000), ("5 hazaar tak", 5000), ("teen hazaar se kam", 3000), ("budget ₹8,000", 8000)],
)
def test_user_amounts_are_normalized(text, amount):
    assert amount in user_amounts(text)


def test_tool_facts_collect_ids_and_prices_from_any_result_shape():
    search = json.dumps({"results": [{"id": "J1", "price": 1000, "mrp": 1500}], "warnings": [], "applied": {"price_max": 63250}})
    compare = json.dumps({"products": [{"id": "P1", "price": 15000}], "not_found": []})
    assert tool_facts([search, compare, "ValueError: boom"]) == ({"J1", "P1"}, {1000.0, 1500.0, 63250.0, 15000.0})


def test_grounding_flags_invented_amounts_and_unreturned_products():
    catalog = [("J1", "TrekNorth Summit Jacket"), ("J2", "Himfrost Rain Jacket"), ("J3", "Himfrost Rain Jacket"), ("J4", "Snowline Parka")]
    reply_text = "The TrekNorth Summit Jacket is ₹1,000, under your ₹3k budget. J4 is ₹2,000."
    violations = grounding_violations(reply_text, catalog, {"J1"}, {1000.0}, user_amounts("under 3k"))
    assert violations == ["amount ₹2,000 is in no tool result and wasn't typed by the user", "product J4 was named but no tool returned it"]


def test_a_title_shared_by_several_products_is_grounded_when_any_of_them_was_returned():
    catalog = [("J2", "Himfrost Rain Jacket"), ("J3", "Himfrost Rain Jacket"), ("J4", "Snowline Parka")]
    assert grounding_violations("Try the Himfrost Rain Jacket.", catalog, {"J3"}, set(), set()) == []
    assert grounding_violations("Try the Snowline Parka.", catalog, {"J3"}, set(), set()) == ["title 'Snowline Parka' was named but no tool returned it"]


@pytest.mark.parametrize(("text", "language"), [("Yeh jackets aapke budget mein hain.", "hinglish"), ("These are warm.", "english")])
def test_reply_language(text, language):
    assert reply_language(text) == language


def always(conditions, ids):
    return set(ids) if conditions.get("category") == "jackets" else set()


@pytest.mark.parametrize(
    ("expect", "turn", "failure"),
    [
        ({"shown": {"category": "jackets"}}, TurnResult(shown=["J1"]), None),
        ({"shown": {"category": "phones"}}, TurnResult(shown=["J1"]), "shown: ['J1'] don't meet"),
        ({"shown": {"category": "jackets"}}, TurnResult(), "shown: no products were shown"),
        ({"min_shown": 3}, TurnResult(shown=["J1", "J2"]), "min_shown: 2 shown"),
        ({"clarifies": True}, TurnResult(reply="Which category?"), None),
        ({"clarifies": True}, TurnResult(reply="Which one?", tools=["show_products"]), "clarifies"),
        ({"declines": True}, TurnResult(tools=["search_products"]), "declines"),
        ({"mentions": ["TrekNorth"]}, TurnResult(reply="the treknorth one"), None),
        ({"mentions": ["Himfrost"]}, TurnResult(reply="the treknorth one"), "mentions: 'Himfrost'"),
        ({"reply_language": "hinglish"}, TurnResult(reply="These are warm."), "reply_language: replied in english"),
    ],
)
def test_expect_checks(expect, turn, failure):
    failures = expect_failures(expect, turn, always)
    assert failures == [] if failure is None else failures[0].startswith(failure)


def test_matching_ids_uses_search_conditions_and_rejects_unknown_values(index):
    assert matching_ids(index, Filters(category="jackets", price_max=2000, in_stock_only=False), ["J1", "J2", "J3", "P1"]) == {"J1", "J2"}
    with pytest.raises(ValueError, match="unknown color"):
        matching_ids(index, Filters(color="purple"), ["J1"])


@pytest.mark.parametrize(
    ("prices", "cost"),
    # Each call uses Usage(100, 20, 80): 100 x $1 + 20 x $2 + 80 x $0.50 per million tokens, twice.
    [(Prices(input=1, output=2, cache_read=0.5, cache_write=0), 0.00036), (None, None)],
    ids=["priced model", "model without prices"],
)
def test_a_case_runs_end_to_end_and_is_graded(index, prices, cost):
    show = ToolCall("c2", "show_products", {"product_ids": ["J3", "J1"], "headline": "Warm jackets", "reply": "Both are warm, from ₹1,000."})
    provider = ScriptedProvider(reply(stop="tool_use", calls=[SEARCH]), reply(stop="tool_use", calls=[show]))
    provider.prices = prices
    case = Case(id="c", description="d", turns=["warm jacket under 3k"],
                expect={"shown": {"category": "jackets", "price_max": 3000}, "min_shown": 2, "mentions": ["warm"]})
    catalog = [(row["id"], row["title"]) for row in index.conn.execute("SELECT id, title FROM products")]

    result = asyncio.run(run_case(provider, index, catalog, case, Settings(_env_file=None)))
    assert (result["scored"], result["passed"], result["failures"]) == (True, True, [])
    [turn] = result["turns"]
    assert turn["tools"] == ["search_products", "show_products"] and turn["shown"] == ["J3", "J1"]
    assert turn["model_calls"] == 2 and turn["grounding"] == []  # ₹1,000 is J1's price, from the search result
    assert (turn["input_tokens"], turn["output_tokens"], turn["cache_read_tokens"], turn["cache_write_tokens"]) == (200, 40, 160, 0)
    summary = summarize([result])
    if cost is None:  # no prices: cost is left out of the turn and the summary
        assert "cost_usd" not in turn and "total_cost_usd" not in summary
    else:
        assert turn["cost_usd"] == summary["mean_cost_usd"] == summary["total_cost_usd"] == pytest.approx(cost)


def test_the_case_file_is_valid(index):
    """Unknown keys fail validation, and every shown filter uses known categories, sizes, colors and attributes."""
    cases = load_cases(EVALS_DIR / "cases.yaml", [])
    assert len({case.id for case in cases}) == len(cases) == 20
    for case in cases:
        if case.expect.shown is not None:
            matching_ids(index, Filters(**case.expect.shown), ["J1"])  # raises on an unknown filter value


@pytest.mark.parametrize(
    ("calls", "misses"),
    [
        ([Usage(3000, 0, 0), Usage(3000, 0, 0)], 0),  # below the minimum: can't be cached, so not a miss
        ([Usage(5000, 0, 0), Usage(5000, 0, 0)], 1),  # large enough, nothing read
        ([Usage(5000, 0, 0), Usage(1000, 0, 4000)], 0),  # read from the cache
        ([Usage(5000, 0, 0), Usage(1000, 0, 0, 4000)], 1),  # cache writes count toward the size, but aren't a read
        ([Usage(5000, 0, 0)], 0),  # a conversation's first call is never a miss
    ],
)
def test_a_cache_miss_counts_only_calls_large_enough_to_cache(calls, misses):
    assert cache_misses(calls, min_cache_tokens=4096) == misses
    assert cache_misses(calls, min_cache_tokens=None) == 0  # best-effort caching isn't checked


def test_prompt_version_changes_with_any_word_of_the_prompt_or_a_tool():
    snapshot = prompt_snapshot()
    version = prompt_version(snapshot)
    assert len(version) == 12 and version == prompt_version(prompt_snapshot())  # stable for the same prompt
    assert [tool["name"] for tool in snapshot["tools"]] == ["search_products", "get_product_details", "compare_products", "show_products"]
    edited_tool = {**snapshot, "tools": [{**snapshot["tools"][0], "description": "Search."}, *snapshot["tools"][1:]]}
    edited_prompt = {**snapshot, "system_prompt": snapshot["system_prompt"] + " "}
    assert len({version, prompt_version(edited_tool), prompt_version(edited_prompt)}) == 3


def test_git_state_is_unknown_outside_a_checkout(tmp_path):
    assert git_state(tmp_path) == (None, None)
