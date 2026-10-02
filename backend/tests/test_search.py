import json
import re

import numpy as np
import pytest

from app.catalog.embed import embed
from app.catalog.ingest import ingest
from app.search.engine import Filters, diversify, fts_expression, fuse, search_products
from app.search.index import CatalogNotReadyError, load_index
from tests.test_embed import FakeModel
from tests.test_ingest import PHONE, VALID, product, write_lines


def jacket(id, brand, price, rating, review_count, stock, sizes, colors, **attrs):
    return product(
        id=id, brand=brand, price=price, mrp=price, rating=rating, review_count=review_count, stock=stock,
        sizes=sizes, colors=colors, attributes={**VALID["attributes"], **attrs},
    )


CATALOG = [
    jacket("J1", "TrekNorth", 1000, 4.0, 10, 5, ["S", "M"], ["black"], type="down", weight_g=650),
    jacket("J2", "Himfrost", 2000, 4.5, 50, 0, ["L"], ["navy"], type="rain", warmth="light", weight_g=300),
    jacket("J3", "Himfrost", 3000, 4.5, 50, 3, ["M", "L"], ["black", "red"], type="fleece", waterproof=False, weight_g=500),
    jacket("J4", "TrekNorth", 4000, 3.5, 100, 2, ["XL"], ["red"], warmth="high", waterproof=False, weight_g=900),
    {**PHONE, "id": "P1", "price": 15000, "mrp": 15000, "rating": 4.5, "review_count": 50, "stock": 1},
    {**PHONE, "id": "P2", "price": 9000, "mrp": 9000, "rating": 4.0, "review_count": 10, "stock": 1,
     "attributes": {**PHONE["attributes"], "ram_gb": 4, "has_5g": False}},
]


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory):
    path = tmp_path_factory.mktemp("catalog")
    ingest(write_lines(path / "p.jsonl", CATALOG), path)
    embed(path, FakeModel())
    return path


@pytest.fixture(scope="module")
def index(data_dir):
    return load_index(data_dir, model=FakeModel())


def ids(result):
    return [p["id"] for p in result["results"]]


@pytest.mark.parametrize(
    ("filters", "expected"),
    [
        (Filters(category="jackets"), ["J1", "J3", "J4"]),
        (Filters(price_min=3000), ["J3", "J4", "P1", "P2"]),
        (Filters(price_max=3000), ["J1", "J3"]),
        (Filters(brand=["himfrost"]), ["J3"]),
        (Filters(size="M"), ["J1", "J3"]),
        (Filters(color="red"), ["J3", "J4"]),
        (Filters(min_rating=4.5), ["J3", "P1"]),
        (Filters(in_stock_only=False, brand=["Himfrost"]), ["J2", "J3"]),
        (Filters(category="jackets", attributes={"type": "down"}), ["J1", "J4"]),
        (Filters(category="jackets", attributes={"type": ["fleece", "rain"]}, in_stock_only=False), ["J2", "J3"]),
        (Filters(category="jackets", attributes={"waterproof": False}), ["J3", "J4"]),
        (Filters(category="phones", attributes={"ram_gb": 4}), ["P2"]),
        (Filters(category="jackets", attributes={"weight_g": {"min": 500, "max": 700}}), ["J1", "J3"]),
        (Filters(category="jackets", attributes={"weight_g": {"max": 600}}), ["J3"]),
    ],
)
def test_each_filter_returns_only_matching_products(index, filters, expected):
    result = search_products(index, filters=filters, sort="price_asc", limit=20)
    assert sorted(ids(result)) == expected
    assert result["total_matches"] == len(expected) and result["warnings"] == []


@pytest.mark.parametrize(
    ("filters", "expected_count", "warning"),
    [
        (Filters(category="toys"), 5, "unknown category 'toys' ignored"),
        (Filters(size="XXXL"), 5, "unknown size 'XXXL' ignored"),
        (Filters(category="phones", size="M"), 2, "unknown size 'M' ignored"),
        (Filters(color="purple"), 5, "unknown color 'purple' ignored"),
        (Filters(category="jackets", attributes={"insulation": "down"}), 3,
         "unknown attribute 'insulation' for category 'jackets' ignored"),
        (Filters(category="jackets", attributes={"type": "parka"}), 3, "unknown value 'parka' for attribute 'type' ignored"),
        (Filters(category="jackets", attributes={"weight_g": {"min": "heavy"}}), 3,
         "invalid range {'min': 'heavy'} for attribute 'weight_g' ignored"),
        (Filters(attributes={"type": "down"}), 5, "attribute filters need a known category; ignored"),
    ],
)
def test_unknown_filters_warn_and_are_ignored(index, filters, expected_count, warning):
    result = search_products(index, filters=filters, limit=20)
    assert result["total_matches"] == expected_count and result["warnings"] == [warning]


def test_unknown_value_in_a_list_keeps_the_known_ones(index):
    result = search_products(index, filters=Filters(category="jackets", attributes={"type": ["down", "parka"]}))
    assert sorted(ids(result)) == ["J1", "J4"] and len(result["warnings"]) == 1


def test_unknown_brand_matches_nothing_without_warning(index):
    result = search_products(index, filters=Filters(brand=["Nobody"]))
    assert result == {"total_matches": 0, "results": [], "warnings": []}


@pytest.mark.parametrize(
    ("sort", "expected"),
    [
        ("price_asc", ["J1", "J3", "J4", "P2", "P1"]),
        ("price_desc", ["P1", "P2", "J4", "J3", "J1"]),
        # J2 is out of stock; J3 and P1 tie on rating and reviews, so id decides. J1 and P2 tie on rating; J1 by id.
        ("rating", ["J3", "P1", "J1", "P2", "J4"]),
        ("relevance", ["J3", "P1", "J1", "P2", "J4"]),  # empty query falls back to rating
    ],
)
def test_sort_orders_and_tie_breaks(index, sort, expected):
    assert ids(search_products(index, sort=sort)) == expected


def test_review_count_breaks_rating_ties(index):
    result = search_products(index, filters=Filters(in_stock_only=False, min_rating=4.5), sort="rating")
    assert ids(result) == ["J2", "J3", "P1"]


def test_non_relevance_sort_ignores_query(index):
    assert ids(search_products(index, "warm down jacket", sort="price_asc")) == ids(search_products(index, sort="price_asc"))


def test_total_matches_counts_before_limit_and_result_shape(index):
    result = search_products(index, sort="price_asc", limit=2)
    assert result["total_matches"] == 5 and ids(result) == ["J1", "J3"]
    assert result["results"][0] == {
        "id": "J1", "title": VALID["title"], "brand": "TrekNorth", "price": 1000, "mrp": 1000, "rating": 4.0,
        "review_count": 10, "in_stock": True, "sizes": ["S", "M"], "colors": ["black"],
        "attributes": {**VALID["attributes"], "type": "down", "weight_g": 650},
    }


@pytest.mark.parametrize(("kwargs", "message"), [({"limit": 0}, "limit"), ({"limit": 21}, "limit"), ({"sort": "newest"}, "sort")])
def test_invalid_limit_or_sort_raises(index, kwargs, message):
    with pytest.raises(ValueError, match=message):
        search_products(index, **kwargs)


def test_startup_fails_when_a_catalog_file_is_missing(tmp_path):
    with pytest.raises(CatalogNotReadyError, match="Missing catalog.db, embeddings.npy, embedding_ids.json"):
        load_index(tmp_path, model=FakeModel())


def test_startup_fails_when_embeddings_do_not_match_the_catalog(tmp_path):
    ingest(write_lines(tmp_path / "p.jsonl", CATALOG), tmp_path)
    embed(tmp_path, FakeModel())
    (tmp_path / "embedding_ids.json").write_text(json.dumps(["J1"]))
    with pytest.raises(CatalogNotReadyError, match="rerun embedding"):
        load_index(tmp_path, model=FakeModel())


class KeywordModel:
    """Maps a few words to fixed directions ("cozy" means "warm"), so vector ranking is predictable offline."""

    VOCAB = {"warm": 0, "cozy": 0, "snow": 1, "rain": 2, "monsoon": 2, "fleece": 3, "soft": 3}

    def embed(self, texts):
        for text in texts:
            vector = np.zeros(384)
            vector[-1] = 0.1
            for word in re.findall(r"[a-z]+", text.lower()):
                if word in self.VOCAB:
                    vector[self.VOCAB[word]] += 1
            yield vector


QUERY_CATALOG = [
    product(id="Q1", brand="Acme", rating=4.0, title="Alpine Parka", description="A warm insulated parka for snow.", tags=["winter"]),
    product(id="Q2", brand="Acme", rating=4.2, title="Rain Shell", description="A light shell for rain and monsoon.", tags=["monsoon"]),
    product(id="Q3", brand="Acme", rating=4.4, title="Fleece Layer", description="A soft fleece for cool evenings.", tags=["layering"]),
    product(id="Q4", brand="ACME", rating=4.6, title="City Bomber", description="A sleek bomber for the city.", tags=["casual"]),
    product(id="Q5", brand="Bolt", rating=3.0, title="Trail Vest", description="A light vest for trails.", tags=["hiking"]),
]


@pytest.fixture(scope="module")
def query_index(tmp_path_factory):
    path = tmp_path_factory.mktemp("query_catalog")
    ingest(write_lines(path / "p.jsonl", QUERY_CATALOG), path)
    embed(path, KeywordModel())
    return load_index(path, model=KeywordModel())


def test_keyword_list_ranks_exact_words_first(query_index):
    result = search_products(query_index, "monsoon")
    assert ids(result)[0] == "Q2" and result["total_matches"] == 5


def test_vector_list_finds_meaning_that_keywords_miss(query_index):
    assert fts_expression("cozy") == '"cozy"'  # no product contains the word
    assert ids(search_products(query_index, "cozy"))[0] == "Q1"


@pytest.mark.parametrize(
    ("query", "expression"),
    [("NOT rain AND near", '"rain" OR "near"'), ('rain" OR (near*', '"rain" OR "near"'), ("show me the", None)],
)
def test_query_tokens_are_quoted_and_stopwords_dropped(query_index, query, expression):
    assert fts_expression(query) == expression
    assert search_products(query_index, query)["total_matches"] == 5  # never an FTS syntax error


def test_fusion_matches_hand_computed_scores():
    # a: 1/61 + 1/62 = 0.03252, c: 1/63 + 1/61 = 0.03227, b: 1/62 = 0.01613
    assert fuse([["a", "b", "c"], ["c", "a"]], {"a": 1.0, "b": 1.0, "c": 1.0}) == ["a", "c", "b"]
    # Equal scores: higher rating first, then id.
    assert fuse([["x", "z"], ["y"]], {"x": 4.0, "y": 4.5, "z": 5.0}) == ["y", "x", "z"]
    assert fuse([["y"], ["x"]], {"x": 4.0, "y": 4.0}) == ["x", "y"]


def test_diversify_caps_each_brand_at_three_ignoring_case():
    brand = {"a1": "Acme", "a2": "acme", "a3": "Acme", "a4": "ACME", "b1": "Bolt", "a5": "Acme"}
    assert diversify(["a1", "a2", "a3", "a4", "b1", "a5"], brand) == ["a1", "a2", "a3", "b1", "a4", "a5"]


def test_relevance_without_query_is_diversified(query_index):
    # Rating order is Q4, Q3, Q2, Q1, Q5; Q1 is Acme's fourth product, so Bolt's Q5 moves ahead of it.
    assert ids(search_products(query_index)) == ["Q4", "Q3", "Q2", "Q5", "Q1"]


def test_sorts_other_than_relevance_are_not_diversified(query_index):
    assert ids(search_products(query_index, sort="rating")) == ["Q4", "Q3", "Q2", "Q1", "Q5"]
