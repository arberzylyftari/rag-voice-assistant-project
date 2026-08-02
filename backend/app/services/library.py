"""Document management for the admin panel: list, add, remove."""

import logging
from dataclasses import dataclass

from app.db import transaction
from app.services import vector_store
from app.services.chunking import chunk_markdown
from app.services.documents import MESSAGES as DOCUMENT_MESSAGES
from app.services.documents import DocumentError, parse_document
from app.services.indexing import index_pending
from app.services.ingestion import ingest_document

logger = logging.getLogger(__name__)


@dataclass
class LibraryDocument:
    """A document as the admin panel sees it."""

    id: int
    filename: str
    title: str
    version: str | None
    owner: str | None
    chunk_count: int
    indexed: bool
    created_at: str
    updated_at: str


def list_documents() -> list[LibraryDocument]:
    """Every stored document, newest change first."""
    with transaction() as connection:
        rows = connection.execute(
            """
            SELECT id, filename, title, version, owner, chunk_count,
                   checksum, indexed_checksum, created_at, updated_at
              FROM documents
             ORDER BY updated_at DESC, filename
            """
        ).fetchall()

    return [
        LibraryDocument(
            id=row["id"],
            filename=row["filename"],
            title=row["title"],
            version=row["version"],
            owner=row["owner"],
            chunk_count=row["chunk_count"],
            # Ingested but not yet embedded is a real state, and one the
            # panel should show rather than imply the document is searchable.
            indexed=row["indexed_checksum"] == row["checksum"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


async def add_document(filename: str, data: bytes) -> LibraryDocument:
    """Parse, store and index an uploaded document.

    Indexing runs before returning, so a document reported as added is
    already answerable — the requirement is that an upload is usable
    immediately, not eventually.
    """
    source = parse_document(filename, data)
    chunks = chunk_markdown(source).chunks

    if not chunks:
        # Headings with nothing under them parse fine and index to nothing.
        # Rejecting here beats storing a document that answers no question
        # and leaving the administrator to discover it through bad answers.
        raise DocumentError(DOCUMENT_MESSAGES["no_chunks"])

    result = ingest_document(filename, source)

    logger.info("Ingested %s (%s, %d chunks)", filename, result.status, result.chunk_count)

    await index_pending()

    document = find_document(filename)

    if document is None:
        # Ingestion reported success, so the row must exist.
        raise RuntimeError(f"{filename} vanished between ingestion and lookup")

    return document


def find_document(filename: str) -> LibraryDocument | None:
    return next((doc for doc in list_documents() if doc.filename == filename), None)


def get_document(document_id: int) -> LibraryDocument | None:
    return next((doc for doc in list_documents() if doc.id == document_id), None)


def delete_document(document_id: int) -> bool:
    """Remove a document from both stores. False when it did not exist."""
    with transaction() as connection:
        cursor = connection.execute("DELETE FROM documents WHERE id = ?", (document_id,))
        removed = cursor.rowcount > 0

    if not removed:
        return False

    # Chunks cascade in SQLite, but the vector store has no foreign keys —
    # skipping this would leave the document answering questions after it
    # had been deleted.
    vector_store.delete_document(document_id)
    logger.info("Deleted document %d and its vectors", document_id)

    return True
