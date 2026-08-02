"""Speech-to-text over the OpenAI transcription API.

Everything the caller can act on is raised as `TranscriptionError`, which
carries the HTTP status and an Albanian message ready to show the user.
"""

import difflib
import logging
import re

import openai

from app.config import get_settings
from app.services.openai_client import OpenAINotConfigured, get_client

logger = logging.getLogger(__name__)

# Container types the transcription API accepts, mapped to the file extension
# it expects. MediaRecorder produces webm on Chrome/Firefox and mp4 on Safari.
SUPPORTED_AUDIO_TYPES: dict[str, str] = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mpga": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
}

# User-facing messages. Albanian — this is product text.
MESSAGES = {
    "empty": "Skedari i audios eshte bosh. Regjistro serish pyetjen.",
    "too_short": "Nuk u regjistrua asnje ze. Provo serish dhe fol me afer mikrofonit.",
    "too_large": "Regjistrimi eshte shume i madh. Bej nje pyetje me te shkurter.",
    "unsupported_type": "Formati i audios nuk mbeshtetet. Perdor nje shfletues te perditesuar.",
    "no_speech": "Nuk u kuptua asnje fjale. Provo serish dhe fol me qarte.",
    "not_configured": "Sherbimi i transkriptimit nuk eshte i konfiguruar. Kontakto administratorin.",
    "overloaded": "Sherbimi eshte i mbingarkuar per momentin. Provo serish pas pak.",
    "timeout": "Transkriptimi zgjati shume. Provo me nje regjistrim me te shkurter.",
    "unreachable": "Nuk u arrit lidhja me sherbimin e transkriptimit. Kontrollo internetin dhe provo serish.",
    "failed": "Transkriptimi deshtoi. Provo serish.",
}


# Above this similarity to the steering prompt, a transcript is echo rather
# than speech. Real questions share vocabulary with the prompt but score far
# below this; measured echoes score at or near 1.0.
PROMPT_ECHO_THRESHOLD = 0.6


class TranscriptionError(Exception):
    """A failure with a status code and a message the user can act on."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def normalise_content_type(content_type: str | None) -> str:
    """Strip codec parameters: `audio/webm;codecs=opus` -> `audio/webm`."""
    if not content_type:
        return ""
    return content_type.split(";")[0].strip().lower()


def validate_audio(data: bytes, content_type: str | None) -> str:
    """Check the upload before spending an API call on it.

    Returns the file extension to send to the transcription API.
    """
    settings = get_settings()
    media_type = normalise_content_type(content_type)

    if media_type not in SUPPORTED_AUDIO_TYPES:
        raise TranscriptionError(415, MESSAGES["unsupported_type"])

    if not data:
        raise TranscriptionError(400, MESSAGES["empty"])

    if len(data) < settings.min_audio_bytes:
        raise TranscriptionError(400, MESSAGES["too_short"])

    if len(data) > settings.max_audio_bytes:
        raise TranscriptionError(413, MESSAGES["too_large"])

    return SUPPORTED_AUDIO_TYPES[media_type]


def _normalise(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace — for comparison only."""
    return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split())


def is_prompt_echo(text: str, prompt: str) -> bool:
    """True when the transcript is the steering prompt coming back.

    Whisper-family models regurgitate the prompt when the audio contains no
    speech — a pure tone or room noise yields a fluent, plausible-looking
    sentence lifted from the prompt. Left unchecked that fabricated question
    would flow into retrieval and get answered as though the user had asked
    it, so it has to be caught here rather than downstream.
    """
    normalised_text = _normalise(text)
    normalised_prompt = _normalise(prompt)

    if not normalised_text:
        return True

    # Echoes are usually a verbatim span of the prompt.
    if normalised_text in normalised_prompt:
        return True

    ratio = difflib.SequenceMatcher(None, normalised_text, normalised_prompt).ratio()
    return ratio >= PROMPT_ECHO_THRESHOLD


async def transcribe(data: bytes, content_type: str | None) -> str:
    """Transcribe Albanian speech and return the text.

    Raises `TranscriptionError` for anything the user can act on.
    """
    settings = get_settings()
    extension = validate_audio(data, content_type)

    try:
        client = get_client()
    except OpenAINotConfigured:
        raise TranscriptionError(503, MESSAGES["not_configured"]) from None

    try:
        result = await client.audio.transcriptions.create(
            model=settings.stt_model,
            # The API infers the container from the filename, so the extension
            # has to match the actual bytes rather than being cosmetic.
            file=(f"audio.{extension}", data),
            # Albanian is steered with an Albanian-language prompt, not with
            # the `language` parameter — the API rejects the `sq` code. See
            # the prompt's definition in config for the measured difference.
            prompt=settings.stt_prompt,
        )
    except openai.AuthenticationError:
        logger.exception("Transcription rejected the API key")
        raise TranscriptionError(503, MESSAGES["not_configured"]) from None
    except openai.RateLimitError:
        logger.warning("Transcription rate limited")
        raise TranscriptionError(503, MESSAGES["overloaded"]) from None
    except openai.APITimeoutError:
        logger.warning("Transcription timed out")
        raise TranscriptionError(504, MESSAGES["timeout"]) from None
    except openai.APIConnectionError:
        logger.exception("Could not reach the transcription API")
        raise TranscriptionError(503, MESSAGES["unreachable"]) from None
    except openai.BadRequestError:
        # Reaching here means the bytes were malformed in a way the local
        # validation could not see — a truncated container, for example.
        logger.exception("Transcription rejected the audio")
        raise TranscriptionError(400, MESSAGES["unsupported_type"]) from None
    except openai.APIStatusError:
        logger.exception("Transcription returned an error status")
        raise TranscriptionError(502, MESSAGES["failed"]) from None

    text = (result.text or "").strip()

    if not text:
        raise TranscriptionError(422, MESSAGES["no_speech"])

    if is_prompt_echo(text, settings.stt_prompt):
        logger.info("Discarded a transcript that echoed the steering prompt")
        raise TranscriptionError(422, MESSAGES["no_speech"])

    return text
