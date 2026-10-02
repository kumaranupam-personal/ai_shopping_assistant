"""Product cards built from catalog data only (docs/05-api.md, Product card shape)."""

from app.catalog.taxonomy import CATEGORIES, attribute_label, format_attribute_value

CARD_FIELDS = ("id", "title", "brand", "price", "mrp", "rating", "review_count", "image_url")


def build_card(product: dict) -> dict:
    price, mrp = product["price"], product["mrp"]
    highlights = [
        {"label": attribute_label(name), "value": format_attribute_value(name, product["attributes"][name])}
        for name in CATEGORIES[product["category"]].card_attributes
    ]
    return {
        **{name: product[name] for name in CARD_FIELDS},
        "discount_pct": round((mrp - price) / mrp * 100),
        "in_stock": product["stock"] > 0,
        "highlights": highlights,
    }
