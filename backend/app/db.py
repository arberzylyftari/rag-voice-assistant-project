"""SQLite storage for document and chunk metadata.

The vector index holds embeddings; this holds everything the admin panel needs
to list, inspect and delete documents, and the chunk text the answer cites.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id           INTEGER PRIMARY KEY,
    filename     TEXT    NOT NULL UNIQUE,
    title        TEXT    NOT NULL,
    version      TEXT,
    updated      TEXT,
    owner        TEXT,
    -- Hash of the source text, so an unchanged document is not re-embedded.
    checksum     TEXT    NOT NULL,
    chunk_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chunks (
    id           INTEGER PRIMARY KEY,
    document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ordinal      INTEGER NOT NULL,
    heading      TEXT    NOT NULL,
    text         TEXT    NOT NULL,
    char_count   INTEGER NOT NULL,
    UNIQUE (document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks (document_id);
"""


def database_path() -> Path:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return settings.data_dir / "knowledge_base.sqlite"


def connect() -> sqlite3.Connection:
    """Open a connection with foreign keys on and rows as mappings."""
    connection = sqlite3.connect(database_path())
    connection.row_factory = sqlite3.Row
    # Off by default in SQLite, and the chunks cascade depends on it.
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Run a unit of work, committing on success and rolling back on error."""
    connection = connect()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialise() -> None:
    """Create the schema if it does not exist yet."""
    with transaction() as connection:
        connection.executescript(SCHEMA)
