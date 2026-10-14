"""Renders one eval turn as text, the same way for the labeling sheet and the judge (docs/07-evaluation.md, Judge rubric).

A person labeling and the judge read a turn through `render`: the earlier conversation (with every product shown in
it), the user's message, what the agent did, the products shown (rebuilt from the catalog by ID), the headline and
suggestions, the reply and its length. The labeling sheet was rendered before earlier turns listed their products'
details, so the judge sees those details where the sheet shows only titles, brands and prices.
"""

import json
import re

from app.catalog.taxonomy import attribute_label, format_attribute_value, format_rupees

inr = format_rupees  # the currency format in docs/02-catalog.md


def attrs(attributes: dict) -> str:
    """Attributes with the display rules in docs/02-catalog.md, as the API shows them."""
    return ", ".join(f"{attribute_label(k)}: {format_attribute_value(k, v)}" for k, v in attributes.items())


def product_line(n: int, row: dict) -> str:
    """One product as the search returned it to the agent (docs/03-search.md, Result shape)."""
    mrp = f" (MRP {inr(row['mrp'])})" if row["mrp"] != row["price"] else ""
    return (f"{n}. {row['title']} | {row['brand']} | {inr(row['price'])}{mrp} | {row['rating']}★ ({row['review_count']:,} reviews) | "
            f"{'in stock' if row['in_stock'] else 'OUT OF STOCK'} | sizes: {', '.join(row['sizes']) or 'none'} | "
            f"colors: {', '.join(row['colors'])} | {attrs(row['attributes'])}")


def describe_calls(calls: list[dict]) -> str:
    lines = []
    for n, call in enumerate(calls, 1):
        name, args, result = call["name"], call["arguments"], call.get("result")
        if call.get("is_error"):
            lines.append(f"{n}. {name} → ERROR: {result}")
            continue
        if name == "search_products":
            applied = dict(result.get("applied", {}))
            parts = [f"category {applied.pop('category')}" if "category" in applied else "all categories"]
            if "price_min" in applied:
                parts.append(f"price ≥ {inr(applied.pop('price_min'))}")
            if "price_max" in applied:
                parts.append(f"price ≤ {inr(applied.pop('price_max'))}")
            for key in ("size", "color", "min_rating"):
                if key in applied:
                    parts.append(f"{key.replace('_', ' ')} {applied.pop(key)}")
            if "brand" in applied:
                parts.append("brand " + " or ".join(applied.pop("brand")))
            for k, v in applied.pop("attributes", {}).items():
                if isinstance(v, dict):  # a numeric range
                    bounds = [f"≥ {format_attribute_value(k, v['min'])}" if "min" in v else "", f"≤ {format_attribute_value(k, v['max'])}" if "max" in v else ""]
                    parts.append(f"{attribute_label(k)} {' and '.join(b for b in bounds if b)}")
                else:
                    parts.append(f"{attribute_label(k)}: {' or '.join(format_attribute_value(k, x) for x in (v if isinstance(v, list) else [v]))}")
            if applied.get("sort", "relevance") != "relevance":
                parts.append(f"sorted {applied['sort']}")
            if not applied.get("in_stock_only", True):
                parts.append("including out of stock")
            query = f", query \"{args.get('query')}\"" if args.get("query") else ""
            found = f"{result['total_matches']} matches, {len(result['ids'])} returned"
            warn = f" (warnings: {'; '.join(result['warnings'])})" if result.get("warnings") else ""
            lines.append(f"{n}. Search: {'; '.join(parts)}{query} → {found}{warn}")
        elif name == "get_product_details":
            if "error" in result:
                lines.append(f"{n}. Details of {args.get('product_id')} → not found")
            else:
                r = result
                lines.append(f"{n}. Details of {r['title']} ({r['brand']}): {inr(r['price'])}, MRP {inr(r['mrp'])}, {r['rating']}★ "
                             f"({r['review_count']:,} reviews), stock {r['stock']}, sizes: {', '.join(r['sizes']) or 'none'}, "
                             f"colors: {', '.join(r['colors'])}, {attrs(r['attributes'])}. Description: {r['description']}")
        elif name == "compare_products":
            products = "; ".join(f"{p['title']} ({p['brand']}, {inr(p['price'])}, {p['rating']}★, {attrs(p['attributes'])})" for p in result.get("products", []))
            lines.append(f"{n}. Compare: {products}. Differ in: {', '.join(result.get('differing_attributes', [])) or 'nothing'}")
        elif name == "show_products":
            lines.append(f"{n}. Show {len(result.get('shown', []))} products (listed under Products shown)")
        else:
            lines.append(f"{n}. {name}: {json.dumps(args, ensure_ascii=False)}")
    return "\n".join(lines) or "No tools called."


def counts(reply: str) -> str:
    """Words and sentences as rubric decision D4 counts them."""
    words, sentences = len(reply.split()), len(re.findall(r'[.!?](?=\s|$)', reply))
    return f"{words} word{'s' * (words != 1)}, {sentences} sentence{'s' * (sentences != 1)}"


def render(item: dict, rows: dict, edit: dict | None) -> dict:
    data, edit = item["data"], edit or {}
    shown = [edit.get("replace_shown", {}).get(i, i) for i in (data["shown"] or [])]
    show_call = next((c for c in reversed(data["tool_calls"]) if c["name"] == "show_products"), None)
    earlier = []
    for prev in item["history"]:
        products = "\n".join(product_line(k, rows[i]) for k, i in enumerate(prev["shown"] or [], 1))
        earlier.append(f"User: {prev['user']}" + (f"\nAgent showed:\n{products}" if products else "") + f"\nAgent: {prev['reply']}")
    reply = edit.get("reply", data["reply"])
    extras = ""
    if show_call:
        args = show_call["arguments"]
        extras = f"Headline: {args.get('headline', '')}\nSuggestions: {' | '.join(args.get('suggestions') or []) or 'none'}"
    return {
        "Earlier conversation": "\n\n".join(earlier) or "(first turn)",
        "User message": data["user"],
        "What the agent did": describe_calls(data["tool_calls"]),
        "Products shown": "\n".join(product_line(k, rows[i]) for k, i in enumerate(shown, 1)) or "(none)",
        "Headline and suggestions": extras or "(no cards)",
        "Reply": reply,
        "Length": counts(reply),
    }


INFO = ["Earlier conversation", "User message", "What the agent did", "Products shown", "Headline and suggestions", "Reply", "Length"]
