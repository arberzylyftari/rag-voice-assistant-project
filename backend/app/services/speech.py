"""Text-to-speech for the assistant's answers.

No major provider supports Albanian for speech synthesis — not ElevenLabs,
Azure or Google, all checked. OpenAI does not list it either, but measurably
produces intelligible Albanian, which is why it is used here. See the decision
log for the numbers and the limitation this leaves in place.
"""

import logging

import openai

from app.config import get_settings
from app.services.openai_client import OpenAINotConfigured, get_client

logger = logging.getLogger(__name__)

MESSAGES = {
    "not_configured": "Sherbimi i zerit nuk eshte i konfiguruar. Kontakto administratorin.",
    "too_long": "Teksti eshte shume i gjate per t'u lexuar me ze.",
    "empty": "Nuk ka tekst per t'u lexuar.",
    "overloaded": "Sherbimi i zerit eshte i mbingarkuar. Provo serish pas pak.",
    "unreachable": "Nuk u arrit lidhja me sherbimin e zerit. Provo serish.",
    "failed": "Leximi me ze deshtoi. Provo serish.",
}

# Answers are short by design; anything longer is not an answer this system
# produced and should not be spoken on its behalf.
MAX_SPEECH_CHARS = 4000

AUDIO_MEDIA_TYPE = "audio/mpeg"

# Steers pronunciation towards Albanian. The model has no Albanian voice, so
# without this it reads the text through the phonetics of whatever language it
# assumes — the difference is audible on words with ë and ç.
VOICE_INSTRUCTIONS = (
    "Speak in Albanian. Use clear, natural Albanian pronunciation, including "
    "the letters ë and ç. Read at a calm, even pace, as a helpful colleague "
    "explaining a company policy."
)


class SpeechError(Exception):
    """A failure with a message the user can act on."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


async def synthesise(text: str) -> bytes:
    """Render Albanian text as MP3 audio."""
    cleaned = text.strip()

    if not cleaned:
        raise SpeechError(MESSAGES["empty"])

    if len(cleaned) > MAX_SPEECH_CHARS:
        raise SpeechError(MESSAGES["too_long"])

    settings = get_settings()

    try:
        client = get_client()
    except OpenAINotConfigured:
        raise SpeechError(MESSAGES["not_configured"]) from None

    try:
        response = await client.audio.speech.create(
            model=settings.tts_model,
            voice=settings.tts_voice,
            input=cleaned,
            instructions=VOICE_INSTRUCTIONS,
            response_format="mp3",
        )
    except openai.AuthenticationError:
        logger.exception("Speech rejected the API key")
        raise SpeechError(MESSAGES["not_configured"]) from None
    except openai.RateLimitError:
        logger.warning("Speech rate limited")
        raise SpeechError(MESSAGES["overloaded"]) from None
    except (openai.APIConnectionError, openai.APITimeoutError):
        logger.exception("Could not reach the speech API")
        raise SpeechError(MESSAGES["unreachable"]) from None
    except openai.APIStatusError:
        logger.exception("Speech returned an error status")
        raise SpeechError(MESSAGES["failed"]) from None

    audio = response.content

    if not audio:
        logger.warning("Speech returned no audio")
        raise SpeechError(MESSAGES["failed"])

    return audio
