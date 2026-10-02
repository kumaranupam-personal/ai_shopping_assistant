"""Catalog file names and read access shared by ingestion, embedding and search."""

import json
import sqlite3
from pathlib import Path

CATALOG_DB = "catalog.db"
EMBEDDINGS = "embeddings.npy"
EMBEDDING_IDS = "embedding_ids.json"
JSON_COLUMNS = ("sizes", "colors", "attributes", "tags")


def open_catalog(data_dir: Path) -> sqlite3.Connection:
    """Read-only, so a missing catalog raises instead of creating an empty catalog.db."""
    conn = sqlite3.connect(f"{(data_dir / CATALOG_DB).absolute().as_uri()}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def product_from_row(row: sqlite3.Row) -> dict:
    """A product record with its JSON columns decoded."""
    return {key: json.loads(row[key]) if key in JSON_COLUMNS else row[key] for key in row.keys()}


def fetch_products(conn: sqlite3.Connection, ids: list[str]) -> dict[str, dict]:
    """Products by id for the ids that exist; callers decide how to order or report missing ones."""
    if not ids:
        return {}
    rows = conn.execute(f"SELECT * FROM products WHERE id IN ({', '.join('?' * len(ids))})", ids)
    return {row["id"]: product_from_row(row) for row in rows}
