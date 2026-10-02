"""Loads the catalog database, vectors and embedding model once at startup (docs/03-search.md, Index loading)."""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding

from app.catalog.embed import load_model
from app.catalog.store import CATALOG_DB, EMBEDDING_IDS, EMBEDDINGS, open_catalog

FIX_COMMANDS = (
    "Build the catalog from backend/: `uv run python -m app.catalog.ingest <product file>`, "
    "then `uv run python -m app.catalog.embed`."
)


class CatalogNotReadyError(RuntimeError):
    pass


@dataclass(frozen=True)
class SearchIndex:
    conn: sqlite3.Connection
    vectors: np.ndarray  # one L2-normalized row per product
    positions: dict[str, int]  # product id -> row in `vectors`
    model: TextEmbedding


def load_index(data_dir: Path, model: TextEmbedding | None = None) -> SearchIndex:
    missing = [n for n in (CATALOG_DB, EMBEDDINGS, EMBEDDING_IDS) if not (data_dir / n).exists()]
    if missing:
        raise CatalogNotReadyError(f"Missing {', '.join(missing)} in {data_dir}. {FIX_COMMANDS}")
    conn = open_catalog(data_dir)
    ids = json.loads((data_dir / EMBEDDING_IDS).read_text())
    if ids != [row["id"] for row in conn.execute("SELECT id FROM products ORDER BY id")]:
        conn.close()
        raise CatalogNotReadyError(f"Embeddings don't match the catalog in {data_dir}; rerun embedding. {FIX_COMMANDS}")
    positions = {id: i for i, id in enumerate(ids)}
    return SearchIndex(conn, np.load(data_dir / EMBEDDINGS), positions, model or load_model(data_dir))
