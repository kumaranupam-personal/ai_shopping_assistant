"""Loads the catalog database, vectors and embedding model once at startup (docs/03-search.md, Index loading)."""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding

from app.catalog.embed import load_model

FIX_COMMANDS = (
    "Build the catalog from backend/: `uv run python -m app.catalog.ingest <product file>`, "
    "then `uv run python -m app.catalog.embed`."
)


class CatalogNotReadyError(RuntimeError):
    pass


@dataclass(frozen=True)
class SearchIndex:
    conn: sqlite3.Connection
    vectors: np.ndarray  # one row per product, aligned with `ids`
    ids: list[str]
    model: TextEmbedding


def load_index(data_dir: Path, model: TextEmbedding | None = None) -> SearchIndex:
    missing = [n for n in ("catalog.db", "embeddings.npy", "embedding_ids.json") if not (data_dir / n).exists()]
    if missing:
        raise CatalogNotReadyError(f"Missing {', '.join(missing)} in {data_dir}. {FIX_COMMANDS}")
    conn = sqlite3.connect(f"file:{data_dir / 'catalog.db'}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    ids = json.loads((data_dir / "embedding_ids.json").read_text())
    if ids != [row["id"] for row in conn.execute("SELECT id FROM products ORDER BY id")]:
        conn.close()
        raise CatalogNotReadyError(f"Embeddings don't match the catalog in {data_dir}; rerun embedding. {FIX_COMMANDS}")
    return SearchIndex(conn, np.load(data_dir / "embeddings.npy"), ids, model or load_model(data_dir))
