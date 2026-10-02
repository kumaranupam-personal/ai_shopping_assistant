"""Product cards built from catalog data only (docs/05-api.md, Product card shape and GET /api/featured)."""

import sqlite3

from app.catalog.store import product_from_row
from app.catalog.taxonomy import CATEGORIES, attribute_label, format_attribute_value

CARD_FIELDS = ("id", "title", "brand", "price", "mrp", "rating", "review_count", "image_url")
FEATURED_MIN_REVIEWS = 100


def attribute_details(product: dict, names: tuple[str, ...] | None = None) -> list[dict]:
    """Attributes as display label/value pairs, in taxonomy order (all of them unless `names` is given)."""
    category = CATEGORIES[product["category"]]
    return [
        {"label": attribute_label(name), "value": format_attribute_value(name, product["attributes"][name])}
        for name in (names or tuple(a.name for a in category.attributes))
    ]


def build_card(product: dict) -> dict:
    price, mrp = product["price"], product["mrp"]
    highlights = attribute_details(product, CATEGORIES[product["category"]].card_attributes)
    return {
        **{name: product[name] for name in CARD_FIELDS},
        "discount_pct": round((mrp - price) / mrp * 100),
        "in_stock": product["stock"] > 0,
        "highlights": highlights,
    }


def featured_cards(conn: sqlite3.Connection) -> list[dict]:
    """One card per category, in taxonomy order: the best-rated in-stock product with enough reviews to trust it."""
    cards = []
    for category in CATEGORIES:
        row = conn.execute(
            "SELECT * FROM products WHERE category = ? AND stock > 0 AND review_count >= ? "
            "ORDER BY rating DESC, review_count DESC, id LIMIT 1",
            (category, FEATURED_MIN_REVIEWS),
        ).fetchone()
        if row:
            cards.append(build_card(product_from_row(row)))
    return cards
