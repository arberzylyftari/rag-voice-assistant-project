#!/usr/bin/env python
"""Rebuild the Knowledge Base index from the documents on disk.

    python scripts/reindex.py            # ingest and index what changed
    python scripts/reindex.py --force    # re-ingest and re-embed everything
    python scripts/reindex.py --no-embed # parse and store only, no API calls
"""

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.db import initialise  # noqa: E402
from app.services import vector_store  # noqa: E402
from app.services.embeddings import EmbeddingError  # noqa: E402
from app.services.indexing import index_pending  # noqa: E402
from app.services.ingestion import ingest_directory  # noqa: E402

DOCUMENTS_DIR = BACKEND_DIR.parent / "docs" / "sample-documents"


async def run(documents: Path, *, force: bool, embed: bool) -> int:
    initialise()

    results = ingest_directory(documents, force=force)

    if not results:
        print(f"No documents found in {documents}")
        return 1

    width = max(len(result.filename) for result in results)
    for result in results:
        print(f"{result.status:9s} {result.filename:{width}s}  {result.chunk_count:3d} chunks")

    total = sum(result.chunk_count for result in results)
    print(f"\n{len(results)} documents, {total} chunks")

    if not embed:
        print("Skipped embedding (--no-embed)")
        return 0

    if force:
        # Rebuilding from scratch: drop the collection so chunks that no
        # longer exist cannot linger in the index.
        vector_store.reset()

    print("\nEmbedding…")

    try:
        indexed = await index_pending(force=force)
    except EmbeddingError as error:
        print(f"\n{error.message}", file=sys.stderr)
        return 1

    if not indexed:
        print("Index already up to date")
    else:
        for result in indexed:
            print(f"{result.status:9s} {result.filename:{width}s}  {result.chunk_count:3d} chunks")

    print(f"\n{vector_store.count()} chunks in the vector index")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-ingest and re-embed even when nothing has changed",
    )
    parser.add_argument(
        "--no-embed",
        action="store_true",
        help="parse and store only, without calling the embeddings API",
    )
    parser.add_argument(
        "--documents",
        type=Path,
        default=DOCUMENTS_DIR,
        help=f"directory to read from (default: {DOCUMENTS_DIR})",
    )
    args = parser.parse_args()

    if not args.documents.is_dir():
        print(f"No such directory: {args.documents}", file=sys.stderr)
        return 1

    return asyncio.run(run(args.documents, force=args.force, embed=not args.no_embed))


if __name__ == "__main__":
    raise SystemExit(main())
