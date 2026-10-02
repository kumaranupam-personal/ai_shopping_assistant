"""Embeds every product into embeddings.npy and embedding_ids.json (docs/02-catalog.md, Embedding)."""

import json
import sqlite3
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding

from app.config import Settings

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DIMENSIONS = 384


def load_model(data_dir: Path) -> TextEmbedding:
    return TextEmbedding(MODEL_NAME, cache_dir=str(data_dir / "models"))


def embed_texts(model: TextEmbedding, texts: list[str]) -> np.ndarray:
    """Returns one L2-normalized float32 row per text."""
    vectors = np.array(list(model.embed(texts)), dtype=np.float32).reshape(len(texts), DIMENSIONS)
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def product_text(title: str, description: str, tags: list[str]) -> str:
    return " ".join([title, description, *tags])


def embed(data_dir: Path, model: TextEmbedding | None = None) -> int:
    # Read-only, so a missing catalog raises instead of creating an empty catalog.db.
    conn = sqlite3.connect(f"file:{data_dir / 'catalog.db'}?mode=ro", uri=True)
    try:
        rows = conn.execute("SELECT id, title, description, tags FROM products ORDER BY id").fetchall()
    finally:
        conn.close()
    texts = [product_text(title, description, json.loads(tags)) for _, title, description, tags in rows]
    vectors = embed_texts(model or load_model(data_dir), texts)
    np.save(data_dir / "embeddings.npy", vectors)
    (data_dir / "embedding_ids.json").write_text(json.dumps([row[0] for row in rows]))
    return len(rows)


if __name__ == "__main__":
    print(f"Embedded {embed(Settings().data_dir)} products.")
