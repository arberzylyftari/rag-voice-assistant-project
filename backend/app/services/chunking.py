"""Split Knowledge Base documents into retrievable chunks.

The corpus is Markdown with a deliberate heading hierarchy, so chunk
boundaries follow headings rather than a sliding character window. A section
is a self-contained unit of policy; cutting mid-section would split a rule
from its own conditions.
"""

import re
from dataclasses import dataclass, field

# A chunk longer than this is split further on paragraph boundaries. Sized so
# a chunk stays well inside the embedding model's window while still holding a
# whole policy section, tables included.
MAX_CHUNK_CHARS = 1400

HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
METADATA_PATTERN = re.compile(r"^>\s*\*\*(?P<key>[^:*]+):\*\*\s*(?P<value>.+?)\s*$")


@dataclass
class DocumentMetadata:
    """The `> **Key:** value` block each document opens with."""

    title: str
    version: str | None = None
    updated: str | None = None
    owner: str | None = None


@dataclass
class Chunk:
    """One retrievable passage."""

    ordinal: int
    heading_path: list[str]
    text: str

    @property
    def heading(self) -> str:
        """Headings joined for display and for citation."""
        return " › ".join(self.heading_path)

    @property
    def embedding_text(self) -> str:
        """What actually gets embedded.

        The heading path is prepended so a passage carries its own context.
        Without it, "21 ditë pune" embeds as a bare number and matches poorly
        against "sa ditë pushimi kam" — the words that make it findable live
        in the heading, not in the sentence.
        """
        return f"{self.heading}\n\n{self.text}"


@dataclass
class ParsedDocument:
    """A document broken into metadata and chunks."""

    metadata: DocumentMetadata
    chunks: list[Chunk] = field(default_factory=list)


@dataclass
class _Section:
    """A heading and the body directly beneath it, before any subheading."""

    path: list[str]
    lines: list[str] = field(default_factory=list)

    def body(self) -> str:
        return "\n".join(self.lines).strip()


def parse_metadata(lines: list[str], title: str) -> DocumentMetadata:
    """Read the `> **Key:** value` block that opens each document."""
    values: dict[str, str] = {}

    for line in lines:
        if not line.startswith(">"):
            if values:
                break
            continue
        match = METADATA_PATTERN.match(line)
        if match:
            values[match.group("key").strip().lower()] = match.group("value").strip()

    return DocumentMetadata(
        title=values.get("dokument", title),
        version=values.get("versioni"),
        updated=values.get("përditësuar më"),
        owner=values.get("pronar i dokumentit"),
    )


def _split_long_text(text: str, limit: int) -> list[str]:
    """Split on blank lines, keeping paragraphs whole where possible."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    parts: list[str] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph

        if len(candidate) <= limit:
            current = candidate
            continue

        if current:
            parts.append(current)
        # A single paragraph over the limit is kept whole: these are tables
        # and lists, and splitting one destroys more meaning than the extra
        # length costs.
        current = paragraph

    if current:
        parts.append(current)

    return parts


def _collect_sections(lines: list[str]) -> tuple[str, list[_Section]]:
    """Walk the document, returning its title and its heading sections."""
    title = ""
    sections: list[_Section] = []
    current: _Section | None = None
    # Heading text by level, so a subsection knows which section it sits under.
    open_headings: dict[int, str] = {}

    for line in lines:
        match = HEADING_PATTERN.match(line)

        if not match:
            if current is not None:
                current.lines.append(line)
            continue

        level = len(match.group(1))
        heading = match.group(2).strip()

        if level == 1:
            title = heading
            open_headings = {}
            current = None
            continue

        # A heading closes every deeper heading still open.
        open_headings = {lvl: text for lvl, text in open_headings.items() if lvl < level}
        open_headings[level] = heading

        current = _Section(path=[open_headings[lvl] for lvl in sorted(open_headings)])
        sections.append(current)

    return title, sections


def chunk_markdown(source: str) -> ParsedDocument:
    """Parse a Knowledge Base document into chunks.

    A `##` section becomes one chunk, unless it has `###` subsections — then
    each subsection becomes its own chunk, which is what makes the FAQ work:
    every question is independently retrievable rather than buried in a page
    of unrelated answers.
    """
    lines = source.splitlines()
    title, sections = _collect_sections(lines)
    metadata = parse_metadata(lines, title)

    chunks: list[Chunk] = []

    for section in sections:
        body = section.body()

        if not body:
            # A heading with no body of its own only groups subsections.
            continue

        # Every section becomes its own chunk regardless of length. Merging
        # short ones was tried and reverted: it glued unrelated FAQ answers
        # together and, worse, dropped the second question's heading, leaving
        # that question unfindable by its own wording. A short answer is still
        # self-contained, because the heading is what carries it into the
        # embedding.
        path = [metadata.title, *section.path]

        for part in _split_long_text(body, MAX_CHUNK_CHARS):
            chunks.append(Chunk(ordinal=len(chunks), heading_path=path, text=part))

    return ParsedDocument(metadata=metadata, chunks=chunks)
