import json

import numpy as np

from app.catalog.embed import embed, product_text
from app.catalog.ingest import ingest
from tests.test_ingest import PHONE, VALID, write_lines


class FakeModel:
    """Stands in for the fastembed model so tests stay offline and fast."""

    def __init__(self):
        self.texts = []

    def embed(self, texts):
        self.texts = list(texts)
        return [np.full(384, i + 1.0) for i in range(len(self.texts))]


def test_embed_writes_normalized_vectors_in_id_order(tmp_path):
    data_dir = tmp_path / "data"
    ingest(write_lines(tmp_path / "p.jsonl", [PHONE, VALID]), data_dir)
    model = FakeModel()

    assert embed(data_dir, model) == 2

    assert json.loads((data_dir / "embedding_ids.json").read_text()) == ["JKT-00012", "PHN-00001"]
    assert model.texts[0] == product_text(VALID["title"], VALID["description"], VALID["tags"])
    vectors = np.load(data_dir / "embeddings.npy")
    assert vectors.shape == (2, 384) and vectors.dtype == np.float32
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1.0)


def test_product_text_joins_title_description_and_tags():
    assert product_text("Jacket", "Warm.", ["winter", "trekking"]) == "Jacket Warm. winter trekking"
