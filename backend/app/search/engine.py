"""Filtered, ranked catalog search (docs/03-search.md)."""

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Literal

from app.catalog.embed import embed_texts
from app.catalog.store import product_from_row
from app.catalog.taxonomy import CATEGORIES, COLORS, Attribute
from app.search.index import SearchIndex

Sort = Literal["relevance", "price_asc", "price_desc", "rating"]

ORDER_BY = {
    "price_asc": "price ASC",
    "price_desc": "price DESC",
    "rating": "rating DESC",
    "relevance": "rating DESC",  # relevance with an empty query
}
TIE_BREAK = "review_count DESC, id ASC"
SUMMARY_FIELDS = ("id", "title", "brand", "price", "mrp", "rating", "review_count", "sizes", "colors", "attributes")
ALL_SIZES = {size for c in CATEGORIES.values() for size in c.sizes}
LIST_SIZE = 50  # keyword and vector lists each keep their top 50
RRF_K = 60
BRAND_CAP = 3
STOPWORDS = frozenset(
    "a an and are as at be but by for from have i in is it me my need of on or not show some that the "
    "this to under over want with looking please".split()
)


@dataclass
class Filters:
    category: str | None = None
    price_min: int | None = None
    price_max: int | None = None
    brand: list[str] | None = None
    size: str | None = None
    color: str | None = None
    min_rating: float | None = None
    in_stock_only: bool = True
    attributes: dict = field(default_factory=dict)


def _attribute_clause(attr: Attribute, condition, warnings: list[str]) -> tuple[str, list] | None:
    """SQL for one attribute condition, or None (with a warning) when nothing in it is usable."""
    column = f"json_extract(attributes, '$.{attr.name}')"  # name comes from the taxonomy, never from input
    if attr.kind in ("int", "decimal") and isinstance(condition, dict):
        bounds = [(op, condition[key]) for key, op in (("min", ">="), ("max", "<=")) if key in condition]
        if not bounds or any(isinstance(v, bool) or not isinstance(v, (int, float)) for _, v in bounds):
            warnings.append(f"invalid range {condition!r} for attribute {attr.name!r} ignored")
            return None
        return " AND ".join(f"{column} {op} ?" for op, _ in bounds), [v for _, v in bounds]
    values = condition if isinstance(condition, list) else [condition]
    allowed = [v for v in values if attr.allows(v)]
    warnings += [f"unknown value {v!r} for attribute {attr.name!r} ignored" for v in values if not attr.allows(v)]
    if not allowed:
        return None
    return f"{column} IN ({', '.join('?' * len(allowed))})", allowed


def _where(filters: Filters, warnings: list[str]) -> tuple[str, list]:
    clauses, params = [], []

    def add(sql: str, *values):
        clauses.append(sql)
        params.extend(values)

    category = CATEGORIES.get(filters.category) if filters.category else None
    if filters.category and not category:
        warnings.append(f"unknown category {filters.category!r} ignored")
    if category:
        add("category = ?", category.name)
    if filters.price_min is not None:
        add("price >= ?", filters.price_min)
    if filters.price_max is not None:
        add("price <= ?", filters.price_max)
    if filters.brand:
        add(f"lower(brand) IN ({', '.join('?' * len(filters.brand))})", *(b.lower() for b in filters.brand))
    if filters.size:
        if filters.size in (category.sizes if category else ALL_SIZES):
            add("EXISTS (SELECT 1 FROM json_each(sizes) WHERE value = ?)", filters.size)
        else:
            warnings.append(f"unknown size {filters.size!r} ignored")
    if filters.color:
        if filters.color in COLORS:
            add("EXISTS (SELECT 1 FROM json_each(colors) WHERE value = ?)", filters.color)
        else:
            warnings.append(f"unknown color {filters.color!r} ignored")
    if filters.min_rating is not None:
        add("rating >= ?", filters.min_rating)
    if filters.in_stock_only:
        add("stock > 0")
    if filters.attributes and not category:
        warnings.append("attribute filters need a known category; ignored")
    elif filters.attributes:
        for name, condition in filters.attributes.items():
            attr = category.attribute(name)
            if not attr:
                warnings.append(f"unknown attribute {name!r} for category {category.name!r} ignored")
            elif clause := _attribute_clause(attr, condition, warnings):
                add(clause[0], *clause[1])
    return " AND ".join(clauses) or "1", params


def _summary(row) -> dict:
    product = product_from_row(row)
    return {**{name: product[name] for name in SUMMARY_FIELDS}, "in_stock": product["stock"] > 0}


def fts_expression(query: str) -> str | None:
    """Quoted, OR-joined tokens, so words like "and" or "near" are never read as FTS5 operators."""
    tokens = [t for t in re.findall(r"[a-z0-9]+", query.lower()) if t not in STOPWORDS]
    return " OR ".join(f'"{t}"' for t in dict.fromkeys(tokens)) or None


def _keyword_list(index: SearchIndex, query: str, where: str, params: list) -> list[str]:
    expression = fts_expression(query)
    if not expression:
        return []
    rows = index.conn.execute(
        "SELECT p.id FROM products_fts JOIN products p ON p.rowid = products_fts.rowid "
        f"WHERE products_fts MATCH ? AND p.rowid IN (SELECT rowid FROM products WHERE {where}) "
        "ORDER BY bm25(products_fts), p.id LIMIT ?",
        [expression, *params, LIST_SIZE],
    )
    return [row["id"] for row in rows]


def _vector_list(index: SearchIndex, query: str, candidate_ids: list[str]) -> list[str]:
    query_vector = embed_texts(index.model, [query])[0]
    scores = index.vectors[[index.positions[i] for i in candidate_ids]] @ query_vector
    ranked = sorted(zip(candidate_ids, scores.tolist(), strict=True), key=lambda pair: (-pair[1], pair[0]))
    return [i for i, _ in ranked[:LIST_SIZE]]


def fuse(lists: list[list[str]], rating: dict[str, float]) -> list[str]:
    """Reciprocal rank fusion: score is the sum of 1 / (60 + rank) over the lists an id appears in."""
    scores = Counter()
    for ranked in lists:
        for rank, id in enumerate(ranked, start=1):
            scores[id] += 1 / (RRF_K + rank)
    return sorted(scores, key=lambda id: (-scores[id], -rating[id], id))


def diversify(ids: list[str], brand: dict[str, str]) -> list[str]:
    """At most 3 products per brand in order; skipped products follow, in their original order."""
    taken, skipped, counts = [], [], Counter()
    for id in ids:
        key = brand[id].lower()
        (skipped if counts[key] >= BRAND_CAP else taken).append(id)
        counts[key] += 1
    return taken + skipped


def search_products(
    index: SearchIndex, query: str = "", filters: Filters | None = None, sort: Sort = "relevance", limit: int = 10
) -> dict:
    if sort not in ORDER_BY:
        raise ValueError(f"unknown sort {sort!r}")
    if not 1 <= limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    warnings: list[str] = []
    where, params = _where(filters or Filters(), warnings)
    rows = index.conn.execute(
        f"SELECT * FROM products WHERE {where} ORDER BY {ORDER_BY[sort]}, {TIE_BREAK}", params
    ).fetchall()
    by_id = {row["id"]: row for row in rows}
    ranked = list(by_id)
    if sort == "relevance" and query.strip() and rows:
        lists = [_keyword_list(index, query, where, params), _vector_list(index, query, ranked)]
        ranked = fuse(lists, {id: row["rating"] for id, row in by_id.items()})
    if sort == "relevance":
        ranked = diversify(ranked, {id: row["brand"] for id, row in by_id.items()})
    return {"total_matches": len(rows), "results": [_summary(by_id[i]) for i in ranked[:limit]], "warnings": warnings}
