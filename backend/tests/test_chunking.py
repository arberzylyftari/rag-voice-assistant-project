from pathlib import Path

import pytest

from app.services.chunking import MAX_CHUNK_CHARS, chunk_markdown

DOCUMENTS_DIR = Path(__file__).resolve().parent.parent.parent / "docs" / "sample-documents"

SAMPLE = """\
# Politika Provë

> **Dokument:** Politika Provë
> **Versioni:** 1.2
> **Përditësuar më:** 8 janar 2026
> **Pronar i dokumentit:** Departamenti i Provave

## 1. Seksioni i parë

Teksti i seksionit të parë, mjaftueshëm i gjatë për të qenë kuptimplotë.

## 2. Seksion me nënseksione

### 2.1 Nënseksioni A

Përgjigje e shkurtër A.

### 2.2 Nënseksioni B

Përgjigje e shkurtër B.
"""


def corpus_documents() -> list[Path]:
    return [p for p in sorted(DOCUMENTS_DIR.glob("*.md")) if p.name.lower() != "readme.md"]


def test_parses_the_metadata_block():
    metadata = chunk_markdown(SAMPLE).metadata

    assert metadata.title == "Politika Provë"
    assert metadata.version == "1.2"
    assert metadata.updated == "8 janar 2026"
    assert metadata.owner == "Departamenti i Provave"


def test_heading_path_starts_with_the_document_title():
    chunk = chunk_markdown(SAMPLE).chunks[0]

    assert chunk.heading_path[0] == "Politika Provë"
    assert chunk.heading_path[-1] == "1. Seksioni i parë"


def test_subsections_become_separate_chunks():
    headings = [c.heading_path[-1] for c in chunk_markdown(SAMPLE).chunks]

    assert "2.1 Nënseksioni A" in headings
    assert "2.2 Nënseksioni B" in headings


def test_adjacent_short_sections_are_not_merged():
    """Regression: merging short sections dropped the second one's heading.

    Two consecutive short FAQ answers used to end up in one chunk under the
    first question's heading, leaving the second question unfindable by its
    own wording.
    """
    chunks = chunk_markdown(SAMPLE).chunks
    a = next(c for c in chunks if c.heading_path[-1] == "2.1 Nënseksioni A")
    b = next(c for c in chunks if c.heading_path[-1] == "2.2 Nënseksioni B")

    assert "B." not in a.text
    assert "A." not in b.text


def test_a_grouping_heading_with_no_body_produces_no_chunk():
    headings = [c.heading_path[-1] for c in chunk_markdown(SAMPLE).chunks]

    assert "2. Seksion me nënseksione" not in headings


def test_embedding_text_carries_the_heading():
    chunk = chunk_markdown(SAMPLE).chunks[0]

    assert chunk.embedding_text.startswith(chunk.heading)
    assert chunk.text in chunk.embedding_text


def test_chunks_are_numbered_consecutively():
    chunks = chunk_markdown(SAMPLE).chunks

    assert [c.ordinal for c in chunks] == list(range(len(chunks)))


def test_a_document_without_headings_produces_no_chunks():
    assert chunk_markdown("# Vetëm titull\n\nTekst pa asnjë seksion.\n").chunks == []


@pytest.mark.parametrize("path", corpus_documents(), ids=lambda p: p.name)
def test_every_corpus_document_chunks(path: Path):
    parsed = chunk_markdown(path.read_text(encoding="utf-8"))

    assert parsed.chunks, f"{path.name} produced no chunks"
    assert parsed.metadata.title
    assert all(c.text.strip() for c in parsed.chunks)


@pytest.mark.parametrize("path", corpus_documents(), ids=lambda p: p.name)
def test_chunks_stay_within_the_size_limit(path: Path):
    """Only an unsplittable paragraph — a table or a long list — may exceed it."""
    for chunk in chunk_markdown(path.read_text(encoding="utf-8")).chunks:
        if len(chunk.text) <= MAX_CHUNK_CHARS:
            continue
        assert "\n\n" not in chunk.text, (
            f"{path.name} › {chunk.heading} is over the limit but was splittable"
        )


def test_every_faq_question_is_retrievable_on_its_own():
    source = (DOCUMENTS_DIR / "pyetje-te-shpeshta.md").read_text(encoding="utf-8")
    questions = {line[4:].strip() for line in source.splitlines() if line.startswith("### ")}

    headings = {c.heading_path[-1] for c in chunk_markdown(source).chunks}

    assert questions <= headings
