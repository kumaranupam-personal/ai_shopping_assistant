"""Validates a JSONL product file and builds catalog.db (docs/02-catalog.md, Ingestion)."""

import argparse
import json
import os
import sqlite3
import sys
from collections import Counter
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, ValidationError, model_validator

from app.catalog.store import CATALOG_DB, JSON_COLUMNS
from app.catalog.taxonomy import CATEGORIES, COLORS
from app.config import Settings

SCHEMA = Path(__file__).with_name("schema.sql")


class Product(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    # pattern \S: at least one non-space character, so blank text counts as empty.
    title: str = Field(max_length=120, pattern=r"\S")
    brand: str = Field(max_length=60, pattern=r"\S")
    category: str
    price: StrictInt = Field(gt=0)
    mrp: StrictInt = Field(gt=0)
    rating: StrictFloat | StrictInt = Field(ge=0, le=5)
    review_count: StrictInt = Field(ge=0)
    stock: StrictInt = Field(ge=0)
    sizes: list[str]
    colors: list[str] = Field(min_length=1, max_length=4)
    attributes: dict[str, str | bool | int | float]
    tags: list[str] = Field(max_length=10)
    description: str = Field(max_length=1000, pattern=r"\S")
    image_url: str = Field(pattern=r"^https?://\S+$")

    @model_validator(mode="after")
    def check_catalog_rules(self) -> "Product":
        errors = []
        if self.mrp < self.price:
            errors.append("mrp is below price")
        if round(self.rating, 1) != self.rating:
            errors.append("rating has more than one decimal place")
        category = CATEGORIES.get(self.category)
        if category is None:
            errors.append(f"unknown category {self.category!r}")
        else:
            if len(set(self.sizes)) != len(self.sizes) or not set(self.sizes) <= set(category.sizes):
                errors.append("sizes must be distinct values from the category's sizes")
            if bool(self.sizes) != bool(category.sizes):
                errors.append("sizes must be non-empty exactly when the category has sizes")
            expected = {a.name for a in category.attributes}
            if set(self.attributes) != expected:
                errors.append(f"attributes must be exactly {sorted(expected)}")
            else:
                errors += [
                    f"invalid value {value!r} for attribute {name!r}"
                    for name, value in self.attributes.items()
                    if not category.attribute(name).allows(value)
                ]
        if len(set(self.colors)) != len(self.colors) or not set(self.colors) <= set(COLORS):
            errors.append("colors must be distinct values from the color list")
        if any(not tag or tag != tag.lower() for tag in self.tags):
            errors.append("tags must be non-empty lowercase strings")
        if errors:
            raise ValueError("; ".join(errors))
        return self


def validate_line(line: str, seen_ids: set[str]) -> tuple[Product | None, list[str]]:
    try:
        product = Product.model_validate_json(line)
    except ValidationError as e:
        return None, [f"{'.'.join(map(str, err['loc'])) or 'product'}: {err['msg']}" for err in e.errors()]
    if product.id in seen_ids:
        return None, [f"duplicate id {product.id!r}"]
    seen_ids.add(product.id)
    return product, []


def _category_of(line: str) -> str:
    try:
        return str(json.loads(line).get("category", "unknown"))
    except (ValueError, AttributeError):
        return "unknown"


def write_catalog(products: list[Product], db_path: Path) -> None:
    """Builds the database in a temporary file, then swaps it into place."""
    tmp_path = db_path.with_suffix(".db.tmp")
    tmp_path.unlink(missing_ok=True)
    conn = sqlite3.connect(tmp_path)
    try:
        conn.executescript(SCHEMA.read_text())
        fields = list(Product.model_fields)
        rows = [
            [json.dumps(getattr(p, f)) if f in JSON_COLUMNS else getattr(p, f) for f in fields]
            for p in products
        ]
        conn.executemany(
            f"INSERT INTO products ({', '.join(fields)}) VALUES ({', '.join('?' * len(fields))})", rows
        )
        conn.execute("INSERT INTO products_fts (products_fts) VALUES ('rebuild')")
        conn.commit()
    finally:
        conn.close()
    os.replace(tmp_path, db_path)


def ingest(path: Path, data_dir: Path, allow_rejects: bool = False) -> tuple[Counter, Counter, bool]:
    """Returns loaded and rejected counts per category, and whether catalog.db was written."""
    data_dir.mkdir(parents=True, exist_ok=True)
    products, rejects, seen_ids = [], [], set()
    loaded, rejected = Counter(), Counter()
    # split("\n"), not splitlines(): U+2028 and similar are valid inside JSON strings
    for number, line in enumerate(path.read_text(encoding="utf-8").split("\n"), start=1):
        if not line.strip():
            continue
        product, reasons = validate_line(line, seen_ids)
        if product:
            products.append(product)
            loaded[product.category] += 1
        else:
            rejects.append({"line": number, "reasons": reasons})
            rejected[_category_of(line)] += 1
    (data_dir / "ingest_rejects.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rejects))
    if rejects and not allow_rejects:
        return loaded, rejected, False
    write_catalog(products, data_dir / CATALOG_DB)
    return loaded, rejected, True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate a product file and build catalog.db.")
    parser.add_argument("path", type=Path)
    parser.add_argument("--allow-rejects", action="store_true")
    args = parser.parse_args(argv)
    data_dir = Settings().data_dir
    loaded, rejected, written = ingest(args.path, data_dir, args.allow_rejects)
    for category in sorted(loaded.keys() | rejected.keys()):
        print(f"{category}: {loaded[category]} loaded, {rejected[category]} rejected")
    if not written:
        print(f"Rejected lines are listed in {data_dir / 'ingest_rejects.jsonl'}. catalog.db was not changed.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
