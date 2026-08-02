"""Read Knowledge Base documents, chunk them, and record them in SQLite."""

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

from app.db import transaction
from app.services.chunking import chunk_markdown

logger = logging.getLogger(__name__)


@dataclass
class IngestionResult:
    """What happened to one document."""

    filename: str
    title: str
    chunk_count: int
    status: str  # "created" | "updated" | "unchanged"


def checksum(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def ingest_document(filename: str, source: str, *, force: bool = False) -> IngestionResult:
    """Store a document and its chunks, replacing any previous version.

    Re-ingesting an unchanged document is a no-op: the checksum guards it, so
    rebuilding the index does not pay to re-embed text that has not moved.
    """
    parsed = chunk_markdown(source)
    digest = checksum(source)

    with transaction() as connection:
        existing = connection.execute(
            "SELECT id, checksum FROM documents WHERE filename = ?", (filename,)
        ).fetchone()

        if existing and existing["checksum"] == digest and not force:
            return IngestionResult(
                filename=filename,
                title=parsed.metadata.title,
                chunk_count=connection.execute(
                    "SELECT COUNT(*) AS n FROM chunks WHERE document_id = ?",
                    (existing["id"],),
                ).fetchone()["n"],
                status="unchanged",
            )

        if existing:
            # Chunks cascade, so the document keeps its id and any reference
            # to it stays valid while its contents are replaced wholesale.
            connection.execute("DELETE FROM chunks WHERE document_id = ?", (existing["id"],))
            connection.execute(
                """
                UPDATE documents
                   SET title = ?, version = ?, updated = ?, owner = ?,
                       checksum = ?, chunk_count = ?, updated_at = datetime('now')
                 WHERE id = ?
                """,
                (
                    parsed.metadata.title,
                    parsed.metadata.version,
                    parsed.metadata.updated,
                    parsed.metadata.owner,
                    digest,
                    len(parsed.chunks),
                    existing["id"],
                ),
            )
            document_id = existing["id"]
            status = "updated"
        else:
            cursor = connection.execute(
                """
                INSERT INTO documents
                    (filename, title, version, updated, owner, checksum, chunk_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    filename,
                    parsed.metadata.title,
                    parsed.metadata.version,
                    parsed.metadata.updated,
                    parsed.metadata.owner,
                    digest,
                    len(parsed.chunks),
                ),
            )
            document_id = int(cursor.lastrowid or 0)
            status = "created"

        connection.executemany(
            """
            INSERT INTO chunks (document_id, ordinal, heading, text, char_count)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (document_id, chunk.ordinal, chunk.heading, chunk.text, len(chunk.text))
                for chunk in parsed.chunks
            ],
        )

    return IngestionResult(
        filename=filename,
        title=parsed.metadata.title,
        chunk_count=len(parsed.chunks),
        status=status,
    )


def ingest_directory(directory: Path, *, force: bool = False) -> list[IngestionResult]:
    """Ingest every Markdown document in a directory.

    README.md is skipped — it documents the corpus for developers and is not
    part of what the assistant answers from.
    """
    results: list[IngestionResult] = []

    for path in sorted(directory.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue

        results.append(
            ingest_document(path.name, path.read_text(encoding="utf-8"), force=force)
        )

    return results
