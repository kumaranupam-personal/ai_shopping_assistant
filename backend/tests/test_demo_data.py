from collections import Counter

import pytest

from app.catalog.ingest import ingest
from app.catalog.taxonomy import CATEGORIES
from demo.generate import PER_CATEGORY, generate, main, matches, price_range
from demo.templates import TEMPLATES


@pytest.fixture(scope="module")
def products():
    return generate()


def test_generating_twice_gives_identical_files(tmp_path):
    first, second = tmp_path / "a.jsonl", tmp_path / "b.jsonl"
    main(first)
    main(second)
    assert first.read_bytes() == second.read_bytes()


def test_output_passes_ingestion_with_zero_rejects(tmp_path):
    path = tmp_path / "products.jsonl"
    main(path)
    loaded, rejected, written = ingest(path, tmp_path / "data")
    assert written and not rejected


def test_each_category_has_the_right_count(products):
    assert Counter(p["category"] for p in products) == {name: PER_CATEGORY for name in CATEGORIES}


def test_ids_use_the_category_prefix_and_start_at_one(products):
    for name, template in TEMPLATES.items():
        ids = [p["id"] for p in products if p["category"] == name]
        assert ids[0] == f"{template['prefix']}-00001" and ids[-1] == f"{template['prefix']}-{PER_CATEGORY:05d}"


def test_prices_stay_in_the_category_and_spec_ranges(products):
    for p in products:
        template = TEMPLATES[p["category"]]
        low, high = template["price"]
        spec_low, spec_high = price_range(template, p["attributes"])
        assert low <= spec_low <= p["price"] <= spec_high <= high


def test_plausibility_rules_hold(products):
    for p in products:
        for conditions, constraints in TEMPLATES[p["category"]]["rules"]:
            if all(p["attributes"][k] == v for k, v in conditions.items()):
                for name, constraint in constraints.items():
                    assert matches(constraint, p["attributes"][name]), (p["id"], name)


def test_distributions_are_roughly_as_specified(products):
    n = len(products)
    discounted = sum(p["mrp"] > p["price"] for p in products) / n
    out_of_stock = sum(p["stock"] == 0 for p in products) / n
    typical_rating = sum(3.5 <= p["rating"] <= 4.7 for p in products) / n
    assert 0.65 <= discounted <= 0.75
    assert 0.05 <= out_of_stock <= 0.11
    assert typical_rating >= 0.8
