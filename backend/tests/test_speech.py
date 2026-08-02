from types import SimpleNamespace

import httpx
import openai
import pytest

from app.services import speech
from app.services.speech import MAX_SPEECH_CHARS, SpeechError, synthesise

AUDIO = b"ID3\x04\x00fake mp3 payload"


def stub_speech(monkeypatch: pytest.MonkeyPatch, *, content: bytes = AUDIO, capture: dict | None = None) -> None:
    async def create(**kwargs: object) -> object:
        if capture is not None:
            capture.update(kwargs)
        return SimpleNamespace(content=content)

    client = SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=create)))
    monkeypatch.setattr(speech, "get_client", lambda: client)


def stub_failure(monkeypatch: pytest.MonkeyPatch, error: Exception) -> None:
    async def create(**kwargs: object) -> object:
        raise error

    client = SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=create)))
    monkeypatch.setattr(speech, "get_client", lambda: client)


async def test_text_is_rendered_to_audio(monkeypatch: pytest.MonkeyPatch):
    stub_speech(monkeypatch)

    assert await synthesise("Pushimi vjetor eshte 21 dite.") == AUDIO


async def test_the_albanian_instruction_is_sent(monkeypatch: pytest.MonkeyPatch):
    """No provider has an Albanian voice, so pronunciation is steered by prompt."""
    captured: dict = {}
    stub_speech(monkeypatch, capture=captured)

    await synthesise("Pershendetje")

    assert "Albanian" in str(captured["instructions"])
    assert captured["response_format"] == "mp3"


@pytest.mark.parametrize("text", ["", "   ", "\n\t "])
async def test_blank_text_is_rejected(text: str, monkeypatch: pytest.MonkeyPatch):
    def explode() -> object:
        raise AssertionError("the provider must not be called for blank text")

    monkeypatch.setattr(speech, "get_client", explode)

    with pytest.raises(SpeechError, match="tekst"):
        await synthesise(text)


async def test_overlong_text_is_rejected(monkeypatch: pytest.MonkeyPatch):
    def explode() -> object:
        raise AssertionError("the provider must not be called for overlong text")

    monkeypatch.setattr(speech, "get_client", explode)

    with pytest.raises(SpeechError, match="gjate"):
        await synthesise("a" * (MAX_SPEECH_CHARS + 1))


async def test_empty_audio_is_treated_as_a_failure(monkeypatch: pytest.MonkeyPatch):
    stub_speech(monkeypatch, content=b"")

    with pytest.raises(SpeechError, match="deshtoi"):
        await synthesise("Pershendetje")


async def test_a_missing_api_key_is_reported(monkeypatch: pytest.MonkeyPatch):
    def unconfigured() -> object:
        raise speech.OpenAINotConfigured

    monkeypatch.setattr(speech, "get_client", unconfigured)

    with pytest.raises(SpeechError, match="konfiguruar"):
        await synthesise("Pershendetje")


def rate_limited() -> Exception:
    request = httpx.Request("POST", "https://api.openai.com/v1/audio/speech")
    return openai.RateLimitError("rate limited", response=httpx.Response(429, request=request), body=None)


def unreachable() -> Exception:
    return openai.APIConnectionError(
        request=httpx.Request("POST", "https://api.openai.com/v1/audio/speech")
    )


@pytest.mark.parametrize(
    ("build_error", "expected"),
    [(rate_limited, "mbingarkuar"), (unreachable, "lidhja")],
    ids=["rate_limit", "connection"],
)
async def test_provider_failures_map_to_albanian_messages(
    build_error, expected: str, monkeypatch: pytest.MonkeyPatch
):
    stub_failure(monkeypatch, build_error())

    with pytest.raises(SpeechError, match=expected):
        await synthesise("Pershendetje")
