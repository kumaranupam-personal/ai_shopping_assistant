import json

import pytest

from app.agent.session import SessionStore
from app.agent.tools import TOOL_SPECS, TOOLS, TurnContext, current, execute, status_text
from app.catalog.cards import build_card
from app.catalog.taxonomy import format_rupees
from app.llm.base import ToolCall
from tests.conftest import ids
from tests.test_ingest import VALID

PORTABLE_KEYS = {
    "type", "properties", "required", "items", "enum", "minimum", "maximum",
    "minItems", "maxItems", "maxLength", "description", "additionalProperties",
}


@pytest.fixture
def ctx(index):
    """Sets the current turn context, recording emitted events."""
    store = SessionStore(ttl_minutes=60, max_turns=30)
    events = []
    context = TurnContext(index, store.begin_turn(store.create("anthropic").id), lambda *event: events.append(event))
    token = current.set(context)
    yield context, events
    current.reset(token)


def call(name, **arguments):
    result = execute(ToolCall("call_1", name, arguments))
    assert not result.is_error, result.content
    return json.loads(result.content)


@pytest.mark.usefixtures("ctx")
@pytest.mark.parametrize(
    ("attributes", "expected"),
    [
        ([{"name": "waterproof", "any_of": ["false"]}], ["J3", "J4"]),
        ([{"name": "type", "any_of": ["down", "fleece"]}], ["J1", "J3", "J4"]),
        ([{"name": "weight_g", "min": 500, "max": 700}], ["J1", "J3"]),
    ],
)
def test_search_converts_attribute_objects(attributes, expected):
    result = call("search_products", query="", category="jackets", attributes=attributes, sort="price_asc")
    assert ids(result) == expected and result["warnings"] == []


@pytest.mark.usefixtures("ctx")
def test_search_parses_numbers_and_reports_applied_filters():
    result = call("search_products", query="", category="phones", price_max=12000,
                  attributes=[{"name": "ram_gb", "any_of": ["4"]}])
    assert ids(result) == ["P2"]
    assert result["applied"] == {
        "category": "phones", "price_max": 12000, "in_stock_only": True, "attributes": {"ram_gb": 4}, "sort": "relevance",
    }


def test_show_products_drops_unknown_ids_keeps_order_and_records(ctx):
    context, events = ctx
    result = call("show_products", product_ids=["J3", "NOPE", "J1"], headline="Warm jackets", suggestions=["Cheaper"])
    assert result == {
        "shown": [{"position": 1, "id": "J3", "title": VALID["title"]}, {"position": 2, "id": "J1", "title": VALID["title"]}],
        "not_found": ["NOPE"],
    }
    [(event, data)] = events
    assert event == "products" and data["headline"] == "Warm jackets" and data["suggestions"] == ["Cheaper"]
    assert [card["id"] for card in data["products"]] == ["J3", "J1"]
    assert context.turn.shown_ids == ["J3", "J1"]
    assert context.turn.transcript == [
        {"type": "products", "headline": "Warm jackets", "suggestions": ["Cheaper"], "product_ids": ["J3", "J1"]}
    ]


def test_show_products_with_no_known_ids_records_nothing(ctx):
    context, events = ctx
    assert call("show_products", product_ids=["NOPE"], headline="x") == {"shown": [], "not_found": ["NOPE"]}
    assert events == [] and context.turn.transcript == [] and context.turn.shown_ids is None


@pytest.mark.usefixtures("ctx")
def test_compare_lists_differing_attributes():
    result = call("compare_products", product_ids=["J1", "J3", "NOPE"])
    assert [p["id"] for p in result["products"]] == ["J1", "J3"]
    assert set(result["products"][0]) == {"id", "title", "brand", "price", "rating", "attributes"}
    assert result["differing_attributes"] == ["type", "waterproof", "weight_g"] and result["not_found"] == ["NOPE"]


@pytest.mark.usefixtures("ctx")
def test_product_details_returns_the_full_record_or_not_found():
    assert call("get_product_details", product_id="J1")["attributes"]["type"] == "down"
    assert call("get_product_details", product_id="NOPE") == {"error": "not_found"}


@pytest.mark.usefixtures("ctx")
@pytest.mark.parametrize(
    ("name", "arguments"),
    [("no_such_tool", {}), ("compare_products", {"product_ids": ["J1"], "extra": 1}), ("search_products", {"query": "x", "sort": "newest"})],
)
def test_failures_become_error_results(name, arguments):
    result = execute(ToolCall("call_9", name, arguments))
    assert result.is_error and result.call_id == "call_9" and "\n" not in result.content


@pytest.mark.parametrize(
    ("name", "arguments", "text"),
    [
        ("search_products", {"query": "x", "category": "jackets", "price_max": 8000, "size": "L"}, "Searching jackets under ₹8,000 in size L"),
        ("search_products", {"query": "x", "price_min": 100000, "price_max": 124999}, "Searching all products under ₹1,24,999 over ₹1,00,000"),
        ("search_products", {"query": "x", "category": "kitchen_appliances"}, "Searching kitchen appliances"),
        ("get_product_details", {"product_id": "J1"}, "Looking up product details"),
        ("compare_products", {"product_ids": ["J1", "J3"]}, "Comparing 2 products"),
        ("show_products", {"product_ids": ["J1"], "headline": "x"}, None),
    ],
)
def test_status_text(name, arguments, text):
    assert status_text(name, arguments) == text


@pytest.mark.parametrize(("amount", "text"), [(999, "₹999"), (7499, "₹7,499"), (124999, "₹1,24,999"), (10000000, "₹1,00,00,000")])
def test_rupee_format(amount, text):
    assert format_rupees(amount) == text


def test_card_shape_and_highlights():
    card = build_card({**VALID, "stock": 0})
    assert card == {
        "id": "JKT-00012", "title": VALID["title"], "brand": "TrekNorth", "price": 7499, "mrp": 11999, "rating": 4.4,
        "review_count": 1832, "image_url": VALID["image_url"], "discount_pct": 38, "in_stock": False,
        "highlights": [{"label": "type", "value": "down"}, {"label": "warmth", "value": "extreme"},
                       {"label": "waterproof", "value": "yes"}],
    }
    assert build_card({**VALID, "mrp": VALID["price"]})["discount_pct"] == 0


def test_every_tool_has_a_portable_schema():
    def keys(schema):
        found = set(schema)
        for value in schema.get("properties", {}).values():
            found |= keys(value)
        if "items" in schema:
            found |= keys(schema["items"])
        return found

    assert [s.name for s in TOOL_SPECS] == list(TOOLS)
    for spec in TOOL_SPECS:
        assert keys(spec.parameters) <= PORTABLE_KEYS, spec.name


@pytest.mark.usefixtures("ctx")
def test_text_values_are_lowercased_and_empty_conditions_warn():
    result = call("search_products", query="", category="jackets", sort="price_asc",
                  attributes=[{"name": "type", "any_of": ["Down"]}, {"name": "warmth"}])
    assert ids(result) == ["J1", "J4"]
    assert result["warnings"] == ["empty condition for attribute 'warmth' ignored"]
