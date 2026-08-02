from types import SimpleNamespace

import pytest

from app.services import generation
from app.services.generation import (
    REFUSAL,
    GroundedAnswer,
    build_context,
    generate_answer,
    verify_citations,
)
from app.services.vector_store import SearchHit


def make_hit(heading: str, text: str = "Tekst prove.") -> SearchHit:
    return SearchHit(
        chunk_id="1:0",
        document_id=1,
        document_title="Politika Prove",
        heading=heading,
        text=text,
        distance=0.3,
    )


HITS = [make_hit("Politika › 1. Pushimi"), make_hit("Politika › 2. Bartja")]


def stub_model(monkeypatch: pytest.MonkeyPatch, parsed: GroundedAnswer | None) -> None:
    """Replace the provider call with a fixed parsed response."""

    async def parse(**kwargs: object) -> object:
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed))])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))
    monkeypatch.setattr(generation, "get_client", lambda: client)


# --- context rendering ---


def test_passages_are_numbered_from_one():
    context = build_context(HITS)

    assert context.startswith("[1] Politika › 1. Pushimi")
    assert "[2] Politika › 2. Bartja" in context


# --- citation verification ---


def test_citations_resolve_to_headings():
    assert verify_citations([1, 2], HITS) == [
        "Politika › 1. Pushimi",
        "Politika › 2. Bartja",
    ]


def test_citations_outside_the_supplied_range_are_dropped():
    assert verify_citations([1, 7, 0, -3], HITS) == ["Politika › 1. Pushimi"]


def test_a_repeated_citation_is_listed_once():
    assert verify_citations([1, 1, 2], HITS) == [
        "Politika › 1. Pushimi",
        "Politika › 2. Bartja",
    ]


# --- generation ---


async def test_no_passages_refuses_without_calling_the_model(monkeypatch: pytest.MonkeyPatch):
    def explode() -> object:
        raise AssertionError("the model must not be called when nothing was retrieved")

    monkeypatch.setattr(generation, "get_client", explode)

    result = await generate_answer("Sa dite pushimi kam?", [])

    assert not result.answered
    assert result.answer == REFUSAL


async def test_a_grounded_answer_is_returned_with_its_sources(
    monkeypatch: pytest.MonkeyPatch,
):
    stub_model(
        monkeypatch,
        GroundedAnswer(can_answer=True, answer="21 ditë pune në vit.", citations=[1]),
    )

    result = await generate_answer("Sa dite pushimi kam?", HITS)

    assert result.answered
    assert result.answer == "21 ditë pune në vit."
    assert result.citations == ["Politika › 1. Pushimi"]


async def test_the_model_reporting_it_cannot_answer_is_a_refusal(
    monkeypatch: pytest.MonkeyPatch,
):
    stub_model(monkeypatch, GroundedAnswer(can_answer=False, answer="", citations=[]))

    result = await generate_answer("A lejohen kafshet?", HITS)

    assert not result.answered
    assert result.answer == REFUSAL


async def test_an_empty_answer_is_a_refusal(monkeypatch: pytest.MonkeyPatch):
    stub_model(monkeypatch, GroundedAnswer(can_answer=True, answer="   ", citations=[1]))

    assert not (await generate_answer("Pyetje", HITS)).answered


async def test_an_answer_citing_nothing_valid_is_discarded(monkeypatch: pytest.MonkeyPatch):
    """The check that makes a citation a fact rather than a claim.

    A fluent answer naming only passages that were never supplied is exactly
    what this project must not surface, so it is treated as unsupported.
    """
    stub_model(
        monkeypatch,
        GroundedAnswer(can_answer=True, answer="Përgjigje bindëse.", citations=[9, 12]),
    )

    result = await generate_answer("Pyetje", HITS)

    assert not result.answered
    assert result.answer == REFUSAL
    assert result.citations == []


async def test_an_answer_with_no_citations_at_all_is_discarded(
    monkeypatch: pytest.MonkeyPatch,
):
    stub_model(
        monkeypatch, GroundedAnswer(can_answer=True, answer="Përgjigje pa burim.", citations=[])
    )

    assert not (await generate_answer("Pyetje", HITS)).answered


async def test_valid_citations_survive_alongside_invalid_ones(
    monkeypatch: pytest.MonkeyPatch,
):
    stub_model(
        monkeypatch,
        GroundedAnswer(can_answer=True, answer="Përgjigje.", citations=[2, 99]),
    )

    result = await generate_answer("Pyetje", HITS)

    assert result.answered
    assert result.citations == ["Politika › 2. Bartja"]


async def test_an_unparsable_response_raises(monkeypatch: pytest.MonkeyPatch):
    stub_model(monkeypatch, None)

    with pytest.raises(generation.GenerationError):
        await generate_answer("Pyetje", HITS)
