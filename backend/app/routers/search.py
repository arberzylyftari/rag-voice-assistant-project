"""Knowledge Base search endpoint.

Exposes retrieval on its own so the relevance gate can be inspected without
going through the answering step.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas import SearchHitResponse, SearchRequest, SearchResponse
from app.services.embeddings import EmbeddingError
from app.services.retrieval import retrieve

logger = logging.getLogger(__name__)

router = APIRouter(tags=["knowledge-base"])


@router.post("/search", response_model=SearchResponse)
async def search_knowledge_base(request: SearchRequest) -> SearchResponse:
    """Search the Knowledge Base for passages relevant to a question."""
    try:
        result = await retrieve(request.query, limit=request.limit)
    except EmbeddingError as error:
        raise HTTPException(status_code=503, detail=error.message) from None

    return SearchResponse(
        query=result.query,
        relevant=result.is_relevant,
        best_score=round(result.best_score, 4),
        documents=result.documents,
        hits=[
            SearchHitResponse(
                document_title=hit.document_title,
                heading=hit.heading,
                text=hit.text,
                score=round(hit.score, 4),
            )
            for hit in result.hits
        ],
    )
