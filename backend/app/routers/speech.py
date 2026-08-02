"""Text-to-speech endpoint."""

import logging

from fastapi import APIRouter, HTTPException, Response

from app.schemas import SpeakRequest
from app.services.speech import AUDIO_MEDIA_TYPE, SpeechError, synthesise

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


@router.post(
    "/speak",
    responses={200: {"content": {AUDIO_MEDIA_TYPE: {}}, "description": "MP3 audio"}},
)
async def speak(request: SpeakRequest) -> Response:
    """Read Albanian text aloud.

    Kept separate from `/answer` so the text reaches the user immediately and
    the audio follows, rather than the whole turn waiting on synthesis.
    """
    try:
        audio = await synthesise(request.text)
    except SpeechError as error:
        raise HTTPException(status_code=503, detail=error.message) from None

    return Response(
        content=audio,
        media_type=AUDIO_MEDIA_TYPE,
        headers={"Cache-Control": "no-store"},
    )
