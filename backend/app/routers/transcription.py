"""Speech-to-text endpoint."""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import get_settings
from app.schemas import TranscriptionResponse
from app.services.transcription import (
    MESSAGES,
    TranscriptionError,
    transcribe,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])

CHUNK_BYTES = 64 * 1024


async def _read_within_limit(upload: UploadFile, limit: int) -> bytes:
    """Read the upload, aborting as soon as it exceeds `limit`.

    Reading in chunks means an oversized upload is rejected partway through
    rather than being buffered in full first — a single request cannot pull
    an arbitrary amount into memory.
    """
    chunks: list[bytes] = []
    total = 0

    while chunk := await upload.read(CHUNK_BYTES):
        total += len(chunk)
        if total > limit:
            raise TranscriptionError(413, MESSAGES["too_large"])
        chunks.append(chunk)

    return b"".join(chunks)


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)) -> TranscriptionResponse:
    """Transcribe a recorded Albanian question.

    Errors carry an Albanian `detail` the frontend can show as-is.
    """
    settings = get_settings()

    try:
        data = await _read_within_limit(audio, settings.max_audio_bytes)
    except TranscriptionError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from None
    except Exception:
        logger.exception("Could not read the uploaded audio")
        raise HTTPException(status_code=400, detail=MESSAGES["empty"]) from None
    finally:
        await audio.close()

    try:
        text = await transcribe(data, audio.content_type)
    except TranscriptionError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from None

    return TranscriptionResponse(text=text, model=settings.stt_model)
