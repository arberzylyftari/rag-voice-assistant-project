from types import SimpleNamespace

import openai
import pytest

from app.services import followup
from app.services.followup import (
    MAX_HISTORY_TURNS,
    StandaloneQuestion,
    Turn,
    render_history,
    resolve_question,
)

HISTORY = [
    Turn(role="user", content="Sa dite pushimi vjetor kam?"),
    Turn(role="assistant", content="21 dite pune ne vit."),
]


def stub_rewrite(
    monkeypatch: pytest.MonkeyPatch,
    parsed: StandaloneQuestion | None,
    *,
    capture: dict | None = None,
) -> None:
    async def parse(**kwargs: object) -> object:
        if capture is not None:
            capture.update(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed))])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))
    monkeypatch.setattr(followup, "get_client", lambda: client)


def stub_failure(monkeypatch: pytest.MonkeyPatch, error: Exception) -> None:
    async def parse(**kwargs: object) -> object:
        raise error

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))
    monkeypatch.setattr(followup, "get_client", lambda: client)


def test_history_is_rendered_with_albanian_labels():
    assert render_history(HISTORY) == (
        "Përdoruesi: Sa dite pushimi vjetor kam?\nAsistenti: 21 dite pune ne vit."
    )


async def test_the_first_question_is_not_rewritten(monkeypatch: pytest.MonkeyPatch):
    def explode() -> object:
        raise AssertionError("no rewrite is needed without history")

    monkeypatch.setattr(followup, "get_client", explode)

    assert await resolve_question("Sa dite pushimi kam?", []) == "Sa dite pushimi kam?"


async def test_a_follow_up_is_rewritten_to_stand_alone(monkeypatch: pytest.MonkeyPatch):
    stub_rewrite(
        monkeypatch,
        StandaloneQuestion(question="Sa dite pushimi kam pas pese vjetesh?"),
    )

    resolved = await resolve_question("Po pas pese vjetesh?", HISTORY)

    assert resolved == "Sa dite pushimi kam pas pese vjetesh?"


async def test_only_the_recent_turns_are_sent(monkeypatch: pytest.MonkeyPatch):
    """A long conversation must not grow the rewrite prompt without bound."""
    captured: dict = {}
    stub_rewrite(monkeypatch, StandaloneQuestion(question="Pyetje"), capture=captured)
    long_history = [Turn(role="user", content=f"Pyetja {i}") for i in range(30)]

    await resolve_question("Po ajo?", long_history)

    prompt = captured["messages"][1]["content"]
    assert "Pyetja 29" in prompt
    assert "Pyetja 23" not in prompt
    assert prompt.count("Përdoruesi:") == MAX_HISTORY_TURNS


async def test_a_provider_failure_falls_back_to_the_original(
    monkeypatch: pytest.MonkeyPatch,
):
    """A rewrite is an optimisation, not a gate — losing it must not refuse."""
    stub_failure(monkeypatch, openai.APIError("boom", request=None, body=None))

    assert await resolve_question("Po pas pese vjetesh?", HISTORY) == "Po pas pese vjetesh?"


async def test_an_unparsable_rewrite_falls_back_to_the_original(
    monkeypatch: pytest.MonkeyPatch,
):
    stub_rewrite(monkeypatch, None)

    assert await resolve_question("Po ajo?", HISTORY) == "Po ajo?"


async def test_a_blank_rewrite_falls_back_to_the_original(monkeypatch: pytest.MonkeyPatch):
    stub_rewrite(monkeypatch, StandaloneQuestion(question="   "))

    assert await resolve_question("Po ajo?", HISTORY) == "Po ajo?"


async def test_a_missing_api_key_falls_back_to_the_original(monkeypatch: pytest.MonkeyPatch):
    def unconfigured() -> object:
        raise followup.OpenAINotConfigured

    monkeypatch.setattr(followup, "get_client", unconfigured)

    assert await resolve_question("Po ajo?", HISTORY) == "Po ajo?"


def test_a_turn_rejects_an_unknown_role():
    with pytest.raises(ValueError):
        Turn(role="system", content="Nuk lejohet")
