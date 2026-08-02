#!/usr/bin/env python
"""Rebuild the Knowledge Base index from the documents on disk.

    python scripts/reindex.py            # ingest changed documents
    python scripts/reindex.py --force    # re-ingest everything
"""

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.db import initialise  # noqa: E402
from app.services.ingestion import ingest_directory  # noqa: E402

DOCUMENTS_DIR = BACKEND_DIR.parent / "docs" / "sample-documents"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-ingest documents even when their contents have not changed",
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

    initialise()
    results = ingest_directory(args.documents, force=args.force)

    if not results:
        print(f"No documents found in {args.documents}")
        return 1

    width = max(len(result.filename) for result in results)
    for result in results:
        print(f"{result.status:9s} {result.filename:{width}s}  {result.chunk_count:3d} chunks")

    total = sum(result.chunk_count for result in results)
    print(f"\n{len(results)} documents, {total} chunks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
