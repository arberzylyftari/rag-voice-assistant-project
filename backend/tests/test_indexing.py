from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config import get_settings
from app.db import connect, initialise
from app.services import indexing, vector_store
from app.services.ingestion import ingest_document

DOCUMENT = """\
# Politika Prove

> **Dokument:** Politika Prove

## 1. Seksioni i pare

Teksti i seksionit te pare.

## 2. Seksioni i dyte

Teksti i seksionit te dyte.
"""

SHORTER = """\
# Politika Prove

> **Dokument:** Politika Prove

## 1. Seksioni i pare

Teksti i seksionit te pare, i rishikuar.
"""


def fake_embedding(text: str) -> list[float]:
    """A deterministic stand-in, so tests never call the embeddings API."""
    return [float(len(text) % 7), float(sum(map(ord, text[:8])) % 11), 1.0]


@pytest.fixture
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Isolate SQLite and the vector index, and stub out embedding."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    vector_store.get_collection.cache_clear()

    async def embed_texts(texts: list[str]) -> list[list[float]]:
        return [fake_embedding(t) for t in texts]

    monkeypatch.setattr(indexing, "embed_texts", embed_texts)

    initialise()
    yield

    vector_store.get_collection.cache_clear()
    get_settings.cache_clear()


def indexed_checksum(filename: str) -> str | None:
    connection = connect()
    try:
        row = connection.execute(
            "SELECT indexed_checksum FROM documents WHERE filename = ?", (filename,)
        ).fetchone()
    finally:
        connection.close()
    return row["indexed_checksum"]


@pytest.mark.asyncio
async def test_indexing_puts_every_chunk_in_the_store(store: None):
    ingest_document("prove.md", DOCUMENT)

    results = await indexing.index_pending()

    assert [r.status for r in results] == ["indexed"]
    assert vector_store.count() == 2


@pytest.mark.asyncio
async def test_indexing_records_the_checksum_it_indexed(store: None):
    ingest_document("prove.md", DOCUMENT)

    await indexing.index_pending()

    assert indexed_checksum("prove.md") is not None


@pytest.mark.asyncio
async def test_an_indexed_document_is_not_reindexed(store: None):
    ingest_document("prove.md", DOCUMENT)
    await indexing.index_pending()

    assert await indexing.index_pending() == []


@pytest.mark.asyncio
async def test_force_reindexes_an_up_to_date_document(store: None):
    ingest_document("prove.md", DOCUMENT)
    await indexing.index_pending()

    results = await indexing.index_pending(force=True)

    assert [r.status for r in results] == ["indexed"]
    assert vector_store.count() == 2


@pytest.mark.asyncio
async def test_revised_content_is_reindexed(store: None):
    ingest_document("prove.md", DOCUMENT)
    await indexing.index_pending()

    ingest_document("prove.md", SHORTER)
    results = await indexing.index_pending()

    assert [r.status for r in results] == ["indexed"]


@pytest.mark.asyncio
async def test_shrinking_a_document_leaves_no_orphan_chunks(store: None):
    """Upsert only overwrites the ids it is given, so removals must be explicit."""
    ingest_document("prove.md", DOCUMENT)
    await indexing.index_pending()
    assert vector_store.count() == 2

    ingest_document("prove.md", SHORTER)
    await indexing.index_pending()

    assert vector_store.count() == 1


@pytest.mark.asyncio
async def test_search_returns_the_indexed_chunk(store: None):
    ingest_document("prove.md", DOCUMENT)
    await indexing.index_pending()

    hits = vector_store.search(fake_embedding("Teksti i seksionit te pare."), 2)

    assert hits
    assert all(h.document_title == "Politika Prove" for h in hits)
    assert all(0.0 <= h.score <= 1.0 for h in hits)


@pytest.mark.asyncio
async def test_deleting_a_document_clears_it_from_the_store(store: None):
    ingest_document("prove.md", DOCUMENT)
    await indexing.index_pending()

    connection = connect()
    try:
        document_id = connection.execute("SELECT id FROM documents").fetchone()["id"]
    finally:
        connection.close()

    vector_store.delete_document(document_id)

    assert vector_store.count() == 0


def test_search_on_an_empty_index_returns_nothing(store: None):
    assert vector_store.search([1.0, 2.0, 3.0], 5) == []
