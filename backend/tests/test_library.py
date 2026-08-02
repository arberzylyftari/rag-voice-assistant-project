from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config import get_settings
from app.db import initialise
from app.services import indexing, library, vector_store
from app.services.documents import DocumentError

DOCUMENT = """\
# Politika Prove

> **Dokument:** Politika Prove
> **Versioni:** 1.0
> **Pronar i dokumentit:** Departamenti i Provave

## 1. Seksioni i pare

Teksti i seksionit te pare.

## 2. Seksioni i dyte

Teksti i seksionit te dyte.
"""

HEADINGS_ONLY = "# Titulli\n\n## 1. Seksioni\n\n## 2. Seksioni\n"


@pytest.fixture
def store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    vector_store.get_collection.cache_clear()

    async def embed_texts(texts: list[str]) -> list[list[float]]:
        return [[float(len(t) % 5), 1.0, 0.0] for t in texts]

    monkeypatch.setattr(indexing, "embed_texts", embed_texts)

    initialise()
    yield

    vector_store.get_collection.cache_clear()
    get_settings.cache_clear()


async def test_an_uploaded_document_is_listed_and_indexed(store: None):
    document = await library.add_document("prove.md", DOCUMENT.encode())

    assert document.title == "Politika Prove"
    assert document.chunk_count == 2
    # Indexing completes before the upload returns, so the document is
    # answerable by the time the panel shows it.
    assert document.indexed
    assert vector_store.count() == 2


async def test_metadata_reaches_the_listing(store: None):
    await library.add_document("prove.md", DOCUMENT.encode())

    listed = library.list_documents()[0]

    assert listed.version == "1.0"
    assert listed.owner == "Departamenti i Provave"


async def test_a_document_with_no_usable_sections_is_rejected(store: None):
    """Headings with nothing under them parse fine and index to nothing."""
    with pytest.raises(DocumentError, match="seksion"):
        await library.add_document("bosh.md", HEADINGS_ONLY.encode())

    assert library.list_documents() == []


async def test_reuploading_replaces_rather_than_duplicates(store: None):
    await library.add_document("prove.md", DOCUMENT.encode())

    revised = DOCUMENT + "\n## 3. Seksioni i trete\n\nTekst i shtuar.\n"
    document = await library.add_document("prove.md", revised.encode())

    assert len(library.list_documents()) == 1
    assert document.chunk_count == 3
    assert vector_store.count() == 3


async def test_deleting_removes_the_document_and_its_vectors(store: None):
    document = await library.add_document("prove.md", DOCUMENT.encode())

    assert library.delete_document(document.id)

    assert library.list_documents() == []
    # Vectors have no foreign keys, so this is the check that matters: a
    # document left in the index keeps answering after it is deleted.
    assert vector_store.count() == 0


async def test_deleting_leaves_other_documents_alone(store: None):
    first = await library.add_document("nje.md", DOCUMENT.encode())
    await library.add_document("dy.md", DOCUMENT.replace("Prove", "Dyte").encode())

    library.delete_document(first.id)

    assert [d.filename for d in library.list_documents()] == ["dy.md"]
    assert vector_store.count() == 2


def test_deleting_something_that_does_not_exist_reports_false(store: None):
    assert not library.delete_document(4242)


async def test_lookup_by_filename_and_id(store: None):
    document = await library.add_document("prove.md", DOCUMENT.encode())

    assert library.find_document("prove.md") is not None
    assert library.get_document(document.id) is not None
    assert library.find_document("mungon.md") is None
    assert library.get_document(9999) is None
