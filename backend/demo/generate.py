"""Writes the deterministic demo catalog to demo/products.jsonl (docs/02-catalog.md, Demo data)."""

import json
import random
from pathlib import Path

from app.catalog.taxonomy import CATEGORIES, COLORS, Attribute, Category, format_attribute_value
from demo.templates import TEMPLATES

OUTPUT = Path(__file__).with_name("products.jsonl")
PER_CATEGORY = 300


def _sample(attr: Attribute, choices, rng: random.Random):
    """Picks from a list of choices, or from a (min, max) range in the attribute's type."""
    if isinstance(choices, list):
        return rng.choice(choices)
    low, high = choices
    return rng.randint(low, high) if attr.kind == "int" else round(rng.uniform(low, high), 1)


def sample_attributes(category: Category, rules: list, rng: random.Random) -> dict:
    attrs = {
        a.name: rng.choice([True, False]) if a.kind == "bool" else _sample(a, list(a.values) or (a.min, a.max), rng)
        for a in category.attributes
    }
    for conditions, constraints in rules:
        if all(attrs[name] == value for name, value in conditions.items()):
            for name, constraint in constraints.items():
                attrs[name] = _sample(category.attribute(name), constraint, rng)
    return attrs


def _describe(template: dict, brand: str, attrs: dict, rng: random.Random) -> tuple[str, str]:
    shown = {name: format_attribute_value(name, value) for name, value in attrs.items()}
    names = template.get("names", {})
    title_words = {
        name: names.get(name, {}).get(value, shown[name].title() if isinstance(value, str) else shown[name])
        for name, value in attrs.items()
    }
    title = template["title"].format(brand=brand, model=rng.choice(template["models"]), **title_words)
    general = rng.sample(template["sentences"], rng.randint(2, 3))
    flags = [pair[0] if attrs[name] else pair[1] for name, pair in template["bool_sentences"].items()]
    sentences = [s.format(brand=brand, **shown) for s in (general + flags)[:4]]
    return title, " ".join(s[0].upper() + s[1:] for s in sentences)


def _tags(template: dict, attrs: dict) -> list[str]:
    tags = []
    for name, by_value in template["tags"].items():
        tags += [t for t in by_value.get(attrs[name], []) if t not in tags]
    return tags[:10]


def price_range(template: dict, attrs: dict) -> tuple[int, int]:
    low, high = template["price"]
    for name, ranges in template.get("price_by", {}).items():
        low, high = ranges.get(attrs[name], (low, high))
    return low, high


def make_product(category: Category, number: int, rng: random.Random) -> dict:
    template = TEMPLATES[category.name]
    attrs = sample_attributes(category, template["rules"], rng)
    brand = rng.choice(template["brands"])
    title, description = _describe(template, brand, attrs, rng)

    low, high = price_range(template, attrs)
    price = rng.randrange(low + 1, high + 2, 10) - 1  # prices end in 9
    discount = rng.randint(5, 60) if rng.random() < 0.7 else 0
    rating = round(min(5.0, max(1.0, rng.gauss(4.1, 0.35))), 1)
    sizes = sorted(rng.sample(category.sizes, rng.randint(2, len(category.sizes))), key=category.sizes.index) if category.sizes else []

    return {
        "id": f"{template['prefix']}-{number:05d}",
        "title": title,
        "brand": brand,
        "category": category.name,
        "price": price,
        "mrp": round(price / (1 - discount / 100)),
        "rating": rating,
        "review_count": int(25000 * ((rating - 1) / 4) ** 3 * rng.random()),
        "stock": 0 if rng.random() < 0.08 else rng.randint(1, 250),
        "sizes": sizes,
        "colors": rng.sample(COLORS, rng.randint(1, 4)),
        "attributes": attrs,
        "tags": _tags(template, attrs),
        "description": description,  # no image_url: the demo has no real product imagery
    }


def generate(seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    return [
        make_product(category, number, rng)
        for category in CATEGORIES.values()
        for number in range(1, PER_CATEGORY + 1)
    ]


def main(path: Path = OUTPUT) -> int:
    products = generate()
    path.write_text("".join(json.dumps(p) + "\n" for p in products), encoding="utf-8")
    return len(products)


if __name__ == "__main__":
    print(f"Wrote {main()} products to {OUTPUT}.")
