"""Embed ingested chunks and push them into the vector index.

Ingestion writes SQLite and is deterministic; this step calls the embeddings
API. Keeping them apart means the parsing half stays testable without network
access, and a failed embedding run can be retried without re-parsing anything.
"""

import logging
from dataclasses import dataclass

from app.db import transaction
from app.services import vector_store
from app.services.chunking import Chunk
from app.services.embeddings import embed_texts

logger = logging.getLogger(__name__)


@dataclass
class IndexResult:
    """What happened to one document."""

    filename: str
    title: str
    chunk_count: int
    status: str  # "indexed" | "current"


def _pending_documents(force: bool) -> list[dict]:
    """Documents whose indexed checksum has fallen behind their content."""
    query = """
        SELECT id, filename, title, checksum, indexed_checksum
          FROM documents
         ORDER BY filename
    """

    with transaction() as connection:
        rows = [dict(row) for row in connection.execute(query)]

    if force:
        return rows

    return [row for row in rows if row["indexed_checksum"] != row["checksum"]]


def _load_chunks(document_id: int) -> list[tuple[int, str, str]]:
    with transaction() as connection:
        rows = connection.execute(
            "SELECT ordinal, heading, text FROM chunks WHERE document_id = ? ORDER BY ordinal",
            (document_id,),
        ).fetchall()

    return [(row["ordinal"], row["heading"], row["text"]) for row in rows]


def _mark_indexed(document_id: int, checksum: str) -> None:
    with transaction() as connection:
        connection.execute(
            "UPDATE documents SET indexed_checksum = ? WHERE id = ?",
            (checksum, document_id),
        )


async def index_pending(*, force: bool = False) -> list[IndexResult]:
    """Embed and index every document that needs it."""
    results: list[IndexResult] = []

    for row in _pending_documents(force):
        chunks = _load_chunks(row["id"])

        if not chunks:
            logger.warning("Skipping %s: no chunks stored", row["filename"])
            continue

        if row["indexed_checksum"] == row["checksum"] and not force:
            results.append(
                IndexResult(row["filename"], row["title"], len(chunks), "current")
            )
            continue

        # The heading travels into the vector alongside the text — see Chunk
        # for why a bare passage embeds poorly.
        texts = [
            Chunk(ordinal=ordinal, heading_path=heading.split(" › "), text=text).embedding_text
            for ordinal, heading, text in chunks
        ]

        embeddings = await embed_texts(texts)

        # Replacing a document's chunks can leave orphans behind when the new
        # version has fewer, since upsert only overwrites ids it is given.
        vector_store.delete_document(row["id"])
        vector_store.upsert_chunks(row["id"], row["title"], chunks, embeddings)

        # Written only after the index succeeds, so a crash mid-run leaves the
        # document pending rather than silently unindexed.
        _mark_indexed(row["id"], row["checksum"])

        results.append(IndexResult(row["filename"], row["title"], len(chunks), "indexed"))

    return results
