"""The agent's tools, their schemas and status text (docs/04-agent.md, Tools; docs/05-api.md, Status text)."""

import json
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import asdict, dataclass

from app.agent.session import Turn
from app.catalog.cards import build_card
from app.catalog.store import fetch_products
from app.catalog.taxonomy import CATEGORIES, COLORS, format_rupees
from app.llm.base import ToolCall, ToolResult, ToolSpec
from app.search.engine import Filters, search_products
from app.search.index import SearchIndex


@dataclass(frozen=True)
class TurnContext:
    index: SearchIndex
    turn: Turn
    emit: Callable[[str, dict], None]  # sends a stream event: (type, data)


current: ContextVar[TurnContext] = ContextVar("current_turn")

COMPARE_FIELDS = ("id", "title", "brand", "price", "rating", "attributes")


def _parse_value(attr, value: str):
    """Tool inputs are strings; turn them into the attribute's type when the attribute is known."""
    if attr is None:
        return value
    if attr.kind == "text":
        return value.lower()  # catalog text values are lowercase
    if attr.kind == "bool":
        return {"true": True, "false": False}.get(value.lower(), value)
    try:
        number = float(value)
    except ValueError:
        return value
    return int(number) if attr.kind == "int" and number.is_integer() else number


def _attribute_conditions(category: str | None, attributes: list[dict]) -> dict:
    conditions = {}
    known = CATEGORIES.get(category)
    for item in attributes:
        attr = known.attribute(item["name"]) if known else None
        if "min" in item or "max" in item:
            conditions[item["name"]] = {k: item[k] for k in ("min", "max") if k in item}
        else:
            values = [_parse_value(attr, str(v)) for v in item.get("any_of", [])]  # tolerate non-string values
            conditions[item["name"]] = values[0] if len(values) == 1 else values
    return conditions


def search_products_tool(query: str, sort: str = "relevance", attributes: list[dict] | None = None, **filters) -> dict:
    if isinstance(filters.get("brand"), str):  # one brand sent bare; a string would otherwise filter by its letters
        filters["brand"] = [filters["brand"]]
    filters = Filters(**filters, attributes=_attribute_conditions(filters.get("category"), attributes or []))
    result = search_products(current.get().index, query, filters, sort, limit=10)
    applied = {k: v for k, v in asdict(filters).items() if v not in (None, [], {})} | {"sort": sort}
    return {**result, "applied": applied}


def get_product_details(product_id: str) -> dict:
    return fetch_products(current.get().index.conn, [product_id]).get(product_id, {"error": "not_found"})


def compare_products(product_ids: list[str]) -> dict:
    product_ids = list(dict.fromkeys(product_ids))[:4]
    found = fetch_products(current.get().index.conn, product_ids)
    products = [{k: found[i][k] for k in COMPARE_FIELDS} for i in product_ids if i in found]
    names = sorted({name for p in products for name in p["attributes"]})
    differing = [n for n in names if len({json.dumps(p["attributes"].get(n)) for p in products}) > 1]
    return {
        "products": products,
        "differing_attributes": differing,
        "not_found": [i for i in product_ids if i not in found],
    }


def _is_strings(value) -> bool:
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


def show_products(product_ids: list[str], headline: str, reply: str, suggestions: list[str] | None = None) -> dict:
    # Wrongly typed arguments become an error result the model can correct, before anything is sent or recorded.
    if not _is_strings(product_ids):
        raise TypeError("product_ids must be a list of strings")
    if not isinstance(headline, str) or not isinstance(reply, str):
        raise TypeError("headline and reply must be strings")
    if suggestions is not None and not _is_strings(suggestions):
        raise TypeError("suggestions must be a list of strings")
    ctx = current.get()
    found = fetch_products(ctx.index.conn, product_ids)
    shown = list(dict.fromkeys(i for i in product_ids if i in found))[:8]
    headline = headline[:80]
    suggestions = [s[:30] for s in (suggestions or [])[:4]]
    if shown:
        cards = [build_card(found[i]) for i in shown]
        ctx.emit("products", {"headline": headline, "suggestions": suggestions, "products": cards})
        ctx.emit("text", {"text": reply})
        ctx.turn.transcript += [
            {"type": "products", "headline": headline, "suggestions": suggestions, "product_ids": shown},
            {"type": "assistant", "text": reply},
        ]
        ctx.turn.shown_ids = shown
    return {
        "shown": [{"position": n, "id": i, "title": found[i]["title"]} for n, i in enumerate(shown, start=1)],
        "not_found": [i for i in product_ids if i not in found],
    }


def _is_amount(value) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def status_text(name: str, arguments: dict) -> str | None:
    """Status shown while a tool runs, built from its inputs only. `show_products` has none.

    It runs before the tool validates anything, so badly typed arguments are skipped rather than raised.
    """
    if name == "search_products":
        category = arguments.get("category")
        text = f"Searching {category.replace('_', ' ') if isinstance(category, str) and category in CATEGORIES else 'all products'}"
        for key, word in (("price_max", "under"), ("price_min", "over")):
            if _is_amount(arguments.get(key)):
                text += f" {word} {format_rupees(arguments[key])}"
        if isinstance(arguments.get("size"), str) and arguments["size"]:
            text += f" in size {arguments['size'][:20]}"
        return text
    if name == "get_product_details":
        return "Looking up product details"
    if name == "compare_products":
        ids = arguments.get("product_ids")
        return f"Comparing {len(ids) if isinstance(ids, list) else 0} products"
    return None


def _object(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


_ID_LIST = {"type": "array", "items": {"type": "string"}}
TOOL_SPECS = [
    ToolSpec(
        "search_products",
        "Search the catalog. Put hard constraints in filters and the user's need and soft preferences in query.",
        _object(
            {
                "query": {"type": "string", "description": "The need in English, e.g. 'warm jacket for winter trekking'."},
                "sort": {"type": "string", "enum": ["relevance", "price_asc", "price_desc", "rating"]},
                "category": {"type": "string", "enum": list(CATEGORIES)},
                "price_min": {"type": "integer", "minimum": 0, "description": "Inclusive, in rupees."},
                "price_max": {"type": "integer", "minimum": 0, "description": "Inclusive, in rupees."},
                "brand": {"type": "array", "items": {"type": "string"}},
                "size": {"type": "string", "description": "Exact size such as 'M' or 'UK 9'."},
                "color": {"type": "string", "enum": list(COLORS)},
                "min_rating": {"type": "number", "minimum": 0, "maximum": 5},
                "in_stock_only": {"type": "boolean", "description": "Defaults to true."},
                "attributes": {
                    "type": "array",
                    "description": "Attribute filters; they need a category. Use any_of for exact values or min/max for numeric ranges.",
                    "items": _object(
                        {
                            "name": {"type": "string"},
                            "any_of": {"type": "array", "items": {"type": "string"}},
                            "min": {"type": "number"},
                            "max": {"type": "number"},
                        },
                        ["name"],
                    ),
                },
            },
            ["query"],
        ),
    ),
    ToolSpec(
        "get_product_details",
        "Get the full record of one product.",
        _object({"product_id": {"type": "string"}}, ["product_id"]),
    ),
    ToolSpec(
        "compare_products",
        "Compare 2 to 4 products side by side and list the attributes that differ.",
        _object({"product_ids": {**_ID_LIST, "minItems": 2, "maxItems": 4}}, ["product_ids"]),
    ),
    ToolSpec(
        "show_products",
        "Display products to the user as cards, best first, with your reply. Only use IDs returned by other tools. "
        "The turn ends once the cards are shown, so put everything you want to say in reply.",
        _object(
            {
                "product_ids": {**_ID_LIST, "minItems": 1, "maxItems": 8},
                "headline": {"type": "string", "maxLength": 80},
                "suggestions": {"type": "array", "maxItems": 4, "items": {"type": "string", "maxLength": 30}},
                "reply": {"type": "string", "description": "Your message to the user, shown after the cards."},
            },
            ["product_ids", "headline", "reply"],
        ),
    ),
]
TOOLS = {
    "search_products": search_products_tool,
    "get_product_details": get_product_details,
    "compare_products": compare_products,
    "show_products": show_products,
}


def execute(call: ToolCall) -> ToolResult:
    """Runs one tool call. Any failure becomes an error result so the model can continue."""
    try:
        if call.name not in TOOLS:
            raise ValueError(f"unknown tool {call.name!r}")
        return ToolResult(call.id, json.dumps(TOOLS[call.name](**call.arguments)))
    except Exception as e:  # noqa: BLE001 - reported to the model, never raised
        return ToolResult(call.id, f"{type(e).__name__}: {e}".splitlines()[0], is_error=True)
