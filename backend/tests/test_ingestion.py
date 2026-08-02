from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config import get_settings
from app.db import connect, initialise
from app.services.ingestion import ingest_directory, ingest_document

DOCUMENT = """\
# Politika Provë

> **Dokument:** Politika Provë
> **Versioni:** 1.0
> **Pronar i dokumentit:** Departamenti i Provave

## 1. Seksioni i parë

Teksti i seksionit të parë.

## 2. Seksioni i dytë

Teksti i seksionit të dytë.
"""

REVISED = DOCUMENT + "\n## 3. Seksioni i tretë\n\nTekst i shtuar më vonë.\n"


@pytest.fixture
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Point storage at a throwaway directory for the duration of one test."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    initialise()
    yield
    get_settings.cache_clear()


def count(table: str) -> int:
    connection = connect()
    try:
        return connection.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]
    finally:
        connection.close()


def test_ingesting_stores_the_document_and_its_chunks(database: None):
    result = ingest_document("prove.md", DOCUMENT)

    assert result.status == "created"
    assert result.title == "Politika Provë"
    assert result.chunk_count == 2
    assert count("documents") == 1
    assert count("chunks") == 2


def test_metadata_is_recorded(database: None):
    ingest_document("prove.md", DOCUMENT)

    connection = connect()
    try:
        row = connection.execute("SELECT * FROM documents").fetchone()
    finally:
        connection.close()

    assert row["title"] == "Politika Provë"
    assert row["version"] == "1.0"
    assert row["owner"] == "Departamenti i Provave"
    assert row["chunk_count"] == 2


def test_reingesting_unchanged_content_is_a_no_op(database: None):
    ingest_document("prove.md", DOCUMENT)

    result = ingest_document("prove.md", DOCUMENT)

    assert result.status == "unchanged"
    assert count("chunks") == 2


def test_force_reingests_unchanged_content(database: None):
    ingest_document("prove.md", DOCUMENT)

    result = ingest_document("prove.md", DOCUMENT, force=True)

    assert result.status == "updated"
    assert count("chunks") == 2


def test_revised_content_replaces_the_previous_chunks(database: None):
    ingest_document("prove.md", DOCUMENT)

    result = ingest_document("prove.md", REVISED)

    assert result.status == "updated"
    assert result.chunk_count == 3
    # Replaced wholesale, not appended to.
    assert count("documents") == 1
    assert count("chunks") == 3


def test_deleting_a_document_removes_its_chunks(database: None):
    ingest_document("prove.md", DOCUMENT)

    connection = connect()
    try:
        with connection:
            connection.execute("DELETE FROM documents")
    finally:
        connection.close()

    assert count("chunks") == 0


def test_ingesting_a_directory_skips_the_readme(database: None, tmp_path: Path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "prove.md").write_text(DOCUMENT, encoding="utf-8")
    (corpus / "README.md").write_text("# Corpus notes\n\n## Section\n\nText.\n", encoding="utf-8")

    results = ingest_directory(corpus)

    assert [r.filename for r in results] == ["prove.md"]
