import json
import sqlite3

import pytest

from app.catalog.ingest import ingest, main

VALID = {
    "id": "JKT-00012",
    "title": "TrekNorth Summit 800 Down Jacket",
    "brand": "TrekNorth",
    "category": "jackets",
    "price": 7499,
    "mrp": 11999,
    "rating": 4.4,
    "review_count": 1832,
    "stock": 42,
    "sizes": ["S", "M", "L"],
    "colors": ["black", "navy"],
    "attributes": {"type": "down", "warmth": "extreme", "waterproof": True, "weight_g": 650, "gender": "men"},
    "tags": ["winter", "trekking"],
    "description": "Rated for sub-zero temperatures.",
    "image_url": "https://placehold.co/400x400?text=Down+Jacket",
}
PHONE = {
    **VALID,
    "id": "PHN-00001",
    "category": "phones",
    "sizes": [],
    "attributes": {
        "ram_gb": 8, "storage_gb": 128, "battery_mah": 5000, "screen_in": 6.5, "camera_mp": 50, "has_5g": True,
    },
}


def product(**changes):
    return {**VALID, **changes}


def with_attrs(**changes):
    return product(attributes={**VALID["attributes"], **changes})


def without(field):
    return {k: v for k, v in VALID.items() if k != field}


def write_lines(path, items):
    path.write_text("".join((i if isinstance(i, str) else json.dumps(i)) + "\n" for i in items))
    return path


def db_ids(data_dir):
    conn = sqlite3.connect(data_dir / "catalog.db")
    try:
        return [row[0] for row in conn.execute("SELECT id FROM products ORDER BY id")]
    finally:
        conn.close()


def test_valid_products_load_with_fts(tmp_path):
    src = write_lines(tmp_path / "p.jsonl", [VALID, PHONE])
    loaded, rejected, written = ingest(src, tmp_path / "data")
    assert written and loaded == {"jackets": 1, "phones": 1} and not rejected
    assert db_ids(tmp_path / "data") == ["JKT-00012", "PHN-00001"]
    conn = sqlite3.connect(tmp_path / "data" / "catalog.db")
    row = conn.execute(
        "SELECT p.id, p.attributes FROM products_fts JOIN products p ON p.rowid = products_fts.rowid "
        "WHERE products_fts MATCH 'trekking'"
    ).fetchone()
    conn.close()
    assert row[0] == "JKT-00012" and json.loads(row[1]) == VALID["attributes"]


BROKEN = {
    "id with bad characters": product(id="JKT 0001"),
    "id too long": product(id="J" * 33),
    "empty title": product(title=""),
    "blank brand": product(brand="   "),
    "blank description": product(description=" "),
    "title too long": product(title="t" * 121),
    "brand too long": product(brand="b" * 61),
    "unknown category": product(category="toys"),
    "zero price": product(price=0),
    "price as string": product(price="7499"),
    "mrp below price": product(mrp=7000),
    "rating above 5": product(rating=5.1),
    "rating with two decimals": product(rating=4.45),
    "negative review count": product(review_count=-1),
    "boolean stock": product(stock=True),
    "missing sizes for sized category": product(sizes=[]),
    "unknown size": product(sizes=["XXXL"]),
    "duplicate size": product(sizes=["M", "M"]),
    "sizes for unsized category": {**PHONE, "sizes": ["M"]},
    "no colors": product(colors=[]),
    "too many colors": product(colors=["black", "white", "grey", "navy", "blue"]),
    "unknown color": product(colors=["purple"]),
    "duplicate color": product(colors=["black", "black"]),
    "missing attribute": product(attributes={k: v for k, v in VALID["attributes"].items() if k != "gender"}),
    "extra attribute": with_attrs(fabric="cotton"),
    "text value not allowed": with_attrs(warmth="scorching"),
    "boolean as string": with_attrs(waterproof="yes"),
    "integer out of range": with_attrs(weight_g=100),
    "decimal with two places": {**PHONE, "attributes": {**PHONE["attributes"], "screen_in": 6.55}},
    "too many tags": product(tags=[f"t{i}" for i in range(11)]),
    "uppercase tag": product(tags=["Winter"]),
    "empty description": product(description=""),
    "description too long": product(description="d" * 1001),
    "non-http image url": product(image_url="ftp://example.com/a.png"),
    "unknown field": product(color="black"),
    "missing field": without("brand"),
    "invalid json": "{not json",
}


@pytest.mark.parametrize("item", BROKEN.values(), ids=BROKEN.keys())
def test_each_broken_rule_rejects_the_line(tmp_path, item):
    src = write_lines(tmp_path / "p.jsonl", [VALID, item])
    loaded, rejected, written = ingest(src, tmp_path / "data")
    assert not written and sum(rejected.values()) == 1
    rejects = [json.loads(line) for line in (tmp_path / "data" / "ingest_rejects.jsonl").read_text().splitlines()]
    assert rejects[0]["line"] == 2 and rejects[0]["reasons"]


def test_duplicate_ids_are_rejected(tmp_path):
    src = write_lines(tmp_path / "p.jsonl", [VALID, product(title="Another")])
    _, rejected, written = ingest(src, tmp_path / "data")
    assert not written and rejected == {"jackets": 1}


def test_exit_code_and_existing_catalog_follow_allow_rejects(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    assert main([str(write_lines(tmp_path / "good.jsonl", [VALID]))]) == 0

    bad = write_lines(tmp_path / "bad.jsonl", [PHONE, product(id="bad id")])
    assert main([str(bad)]) == 1
    assert db_ids(data_dir) == ["JKT-00012"]  # existing catalog untouched

    assert main([str(bad), "--allow-rejects"]) == 0
    assert db_ids(data_dir) == ["PHN-00001"]
    assert not (data_dir / "catalog.db.tmp").exists()
