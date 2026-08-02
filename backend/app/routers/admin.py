"""Document management endpoints.

Kept separate from the conversational API by design: uploading and deleting
documents is not something a user does mid-chat.
"""

import logging
import secrets

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile

from app.config import get_settings
from app.schemas import DocumentResponse, UploadResponse
from app.services.documents import MAX_UPLOAD_BYTES
from app.services.documents import MESSAGES as DOCUMENT_MESSAGES
from app.services.documents import DocumentError
from app.services.embeddings import EmbeddingError
from app.services.library import LibraryDocument, add_document, delete_document, list_documents

logger = logging.getLogger(__name__)

MESSAGES = {
    "disabled": "Paneli i administrimit nuk eshte i aktivizuar.",
    "unauthorised": "Token i pavlefshem administrimi.",
    "not_found": "Dokumenti nuk u gjet.",
}

CHUNK_BYTES = 64 * 1024


async def require_admin(x_admin_token: str = Header(default="")) -> None:
    """Gate the document endpoints behind a shared secret."""
    expected = get_settings().admin_token

    if not expected:
        raise HTTPException(status_code=503, detail=MESSAGES["disabled"])

    # Constant-time, so a wrong token cannot be narrowed down by timing.
    if not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=401, detail=MESSAGES["unauthorised"])


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def to_response(document: LibraryDocument) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        filename=document.filename,
        title=document.title,
        version=document.version,
        owner=document.owner,
        chunk_count=document.chunk_count,
        indexed=document.indexed,
        updated_at=document.updated_at,
    )


async def read_within_limit(upload: UploadFile, limit: int) -> bytes:
    """Read the upload, aborting as soon as it exceeds `limit`."""
    chunks: list[bytes] = []
    total = 0

    while chunk := await upload.read(CHUNK_BYTES):
        total += len(chunk)
        if total > limit:
            raise DocumentError(DOCUMENT_MESSAGES["too_large"])
        chunks.append(chunk)

    return b"".join(chunks)


@router.get("/documents", response_model=list[DocumentResponse])
async def get_documents() -> list[DocumentResponse]:
    """Every document in the Knowledge Base."""
    return [to_response(document) for document in list_documents()]


@router.post("/documents", response_model=UploadResponse, status_code=201)
async def upload_document(file: UploadFile = File(...)) -> UploadResponse:
    """Add a document and index it.

    Indexing completes before this returns, so the document is answerable by
    the time the panel shows it.
    """
    filename = (file.filename or "").strip()

    if not filename:
        raise HTTPException(status_code=400, detail=DOCUMENT_MESSAGES["unsupported"])

    try:
        data = await read_within_limit(file, MAX_UPLOAD_BYTES)
        document = await add_document(filename, data)
    except DocumentError as error:
        raise HTTPException(status_code=400, detail=error.message) from None
    except EmbeddingError as error:
        raise HTTPException(status_code=503, detail=error.message) from None
    finally:
        await file.close()

    return UploadResponse(document=to_response(document), chunk_count=document.chunk_count)


@router.delete("/documents/{document_id}", status_code=204)
async def remove_document(document_id: int) -> None:
    """Delete a document and its vectors."""
    if not delete_document(document_id):
        raise HTTPException(status_code=404, detail=MESSAGES["not_found"])
