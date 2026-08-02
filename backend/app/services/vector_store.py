"""ChromaDB wrapper holding the chunk embeddings.

SQLite is the record of what exists; this is the index that makes it
searchable. Chunk ids are shared between the two (`<document_id>:<ordinal>`),
so a hit here resolves straight back to its row.
"""

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import chromadb
from chromadb.api.models.Collection import Collection

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class SearchHit:
    """One retrieved chunk."""

    chunk_id: str
    document_id: int
    document_title: str
    heading: str
    text: str
    # Cosine distance: 0 is identical, 2 is opposite.
    distance: float

    @property
    def score(self) -> float:
        """Distance as a 0-1 similarity, which reads better in logs and UI."""
        return max(0.0, 1.0 - self.distance / 2.0)


def chunk_id(document_id: int, ordinal: int) -> str:
    return f"{document_id}:{ordinal}"


@lru_cache
def get_collection() -> Collection:
    """Return the persistent collection, creating it on first use."""
    settings = get_settings()
    directory = settings.data_dir / "chroma"
    directory.mkdir(parents=True, exist_ok=True)

    client = chromadb.PersistentClient(path=str(directory))

    return client.get_or_create_collection(
        name=settings.chroma_collection,
        # Cosine matches how the embedding model is trained; the default
        # squared-L2 would rank by magnitude as much as by direction.
        metadata={"hnsw:space": "cosine"},
    )


def upsert_chunks(
    document_id: int,
    document_title: str,
    chunks: list[tuple[int, str, str]],
    embeddings: list[list[float]],
) -> None:
    """Index a document's chunks as `(ordinal, heading, text)` triples."""
    if not chunks:
        return

    collection = get_collection()

    collection.upsert(
        ids=[chunk_id(document_id, ordinal) for ordinal, _, _ in chunks],
        embeddings=embeddings,
        documents=[text for _, _, text in chunks],
        metadatas=[
            {
                "document_id": document_id,
                "document_title": document_title,
                "heading": heading,
                "ordinal": ordinal,
            }
            for ordinal, heading, _ in chunks
        ],
    )


def delete_document(document_id: int) -> None:
    """Remove every chunk belonging to a document."""
    get_collection().delete(where={"document_id": document_id})


def count() -> int:
    return get_collection().count()


def reset() -> None:
    """Drop the whole collection. Used when rebuilding from scratch."""
    settings = get_settings()
    directory = settings.data_dir / "chroma"
    directory.mkdir(parents=True, exist_ok=True)

    client = chromadb.PersistentClient(path=str(directory))
    try:
        client.delete_collection(settings.chroma_collection)
    except Exception:
        # Nothing to drop on a first run.
        logger.debug("No existing collection to reset")

    get_collection.cache_clear()


def search(embedding: list[float], limit: int) -> list[SearchHit]:
    """Return the closest chunks to a query embedding."""
    collection = get_collection()

    if collection.count() == 0:
        return []

    result: Any = collection.query(
        query_embeddings=[embedding],
        # Asking for more than the index holds raises rather than truncating.
        n_results=min(limit, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    hits: list[SearchHit] = []

    for chunk, text, metadata, distance in zip(
        result["ids"][0],
        result["documents"][0],
        result["metadatas"][0],
        result["distances"][0],
        strict=True,
    ):
        hits.append(
            SearchHit(
                chunk_id=chunk,
                document_id=int(metadata["document_id"]),
                document_title=str(metadata["document_title"]),
                heading=str(metadata["heading"]),
                text=text,
                distance=float(distance),
            )
        )

    return hits
