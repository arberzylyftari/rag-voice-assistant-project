from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config import get_settings
from app.db import initialise
from app.services import indexing, retrieval, vector_store
from app.services.vector_store import SearchHit


def hit(score: float, *, title: str = "Politika Prove", heading: str = "1. Seksioni") -> SearchHit:
    """A hit at a chosen score. Cosine distance is the inverse of `score`."""
    return SearchHit(
        chunk_id="1:0",
        document_id=1,
        document_title=title,
        heading=heading,
        text="Tekst prove.",
        distance=(1.0 - score) * 2.0,
    )


@pytest.fixture
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    vector_store.get_collection.cache_clear()

    async def embed_query(text: str) -> list[float]:
        return [1.0, 0.0, 0.0]

    monkeypatch.setattr(retrieval, "embed_query", embed_query)
    initialise()
    yield

    vector_store.get_collection.cache_clear()
    get_settings.cache_clear()


def stub_search(monkeypatch: pytest.MonkeyPatch, hits: list[SearchHit]) -> None:
    monkeypatch.setattr(vector_store, "search", lambda embedding, limit: hits[:limit])


def test_hit_score_and_distance_are_consistent():
    assert hit(0.8).score == pytest.approx(0.8)


async def test_a_confident_hit_clears_the_gate(store: None, monkeypatch: pytest.MonkeyPatch):
    stub_search(monkeypatch, [hit(0.85)])

    result = await retrieval.retrieve("Sa dite pushimi kam?")

    assert result.is_relevant
    assert len(result.hits) == 1


async def test_everything_below_the_threshold_is_rejected(
    store: None, monkeypatch: pytest.MonkeyPatch
):
    stub_search(monkeypatch, [hit(0.74), hit(0.70), hit(0.65)])

    result = await retrieval.retrieve("Si behet nje torte?")

    assert not result.is_relevant
    assert result.hits == []
    # Kept for logging even though nothing cleared the gate.
    assert result.best_score == pytest.approx(0.74)


async def test_weak_hits_are_dropped_from_a_relevant_result(
    store: None, monkeypatch: pytest.MonkeyPatch
):
    stub_search(monkeypatch, [hit(0.85), hit(0.80), hit(0.60)])

    result = await retrieval.retrieve("Sa dite pushimi kam?")

    assert [round(h.score, 2) for h in result.hits] == [0.85, 0.80]


async def test_a_hit_exactly_on_the_threshold_is_kept(
    store: None, monkeypatch: pytest.MonkeyPatch
):
    stub_search(monkeypatch, [hit(retrieval.RELEVANCE_THRESHOLD)])

    assert (await retrieval.retrieve("Pyetje")).is_relevant


async def test_the_limit_caps_the_hits_returned(store: None, monkeypatch: pytest.MonkeyPatch):
    stub_search(monkeypatch, [hit(0.9) for _ in range(10)])

    result = await retrieval.retrieve("Pyetje", limit=3)

    assert len(result.hits) == 3


async def test_documents_are_listed_once_in_hit_order(
    store: None, monkeypatch: pytest.MonkeyPatch
):
    stub_search(
        monkeypatch,
        [hit(0.9, title="Pyetje te Shpeshta"), hit(0.85, title="Politika"), hit(0.8, title="Pyetje te Shpeshta")],
    )

    result = await retrieval.retrieve("Pyetje")

    assert result.documents == ["Pyetje te Shpeshta", "Politika"]


async def test_a_blank_query_is_rejected_without_searching(store: None):
    result = await retrieval.retrieve("   ")

    assert not result.is_relevant
    assert result.best_score == 0.0


async def test_an_empty_index_is_not_relevant(store: None, monkeypatch: pytest.MonkeyPatch):
    stub_search(monkeypatch, [])

    result = await retrieval.retrieve("Sa dite pushimi kam?")

    assert not result.is_relevant
    assert result.best_score == 0.0


async def test_retrieval_finds_a_real_indexed_chunk(
    store: None, monkeypatch: pytest.MonkeyPatch
):
    """End to end against a real Chroma collection, with embedding stubbed."""
    from app.services.ingestion import ingest_document

    async def embed_texts(texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0, 0.0] for _ in texts]

    monkeypatch.setattr(indexing, "embed_texts", embed_texts)

    ingest_document(
        "prove.md",
        "# Politika Prove\n\n> **Dokument:** Politika Prove\n\n## 1. Pushimi\n\nDisa tekst.\n",
    )
    await indexing.index_pending()

    result = await retrieval.retrieve("Sa dite pushimi kam?")

    assert result.is_relevant
    assert result.documents == ["Politika Prove"]
