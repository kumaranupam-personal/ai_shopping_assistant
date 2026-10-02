"""Shared test catalog: four jackets and two phones, built once per session with a fake embedding model."""

import pytest

from app.catalog.embed import embed
from app.catalog.ingest import ingest
from app.search.index import load_index
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


@pytest.fixture(scope="session")
def data_dir(tmp_path_factory):
    path = tmp_path_factory.mktemp("catalog")
    ingest(write_lines(path / "p.jsonl", CATALOG), path)
    embed(path, FakeModel())
    return path


@pytest.fixture(scope="session")
def index(data_dir):
    return load_index(data_dir, model=FakeModel())
