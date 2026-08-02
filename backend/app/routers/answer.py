"""Question answering endpoint: retrieve, then generate a grounded answer."""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas import AnswerRequest, AnswerResponse
from app.services.embeddings import EmbeddingError
from app.services.generation import GenerationError, generate_answer
from app.services.retrieval import retrieve

logger = logging.getLogger(__name__)

router = APIRouter(tags=["knowledge-base"])


@router.post("/answer", response_model=AnswerResponse)
async def answer_question(request: AnswerRequest) -> AnswerResponse:
    """Answer a question from the Knowledge Base, or refuse.

    A refusal is a successful response, not an error: `answered` is false and
    `answer` carries the Albanian message. Only a provider failure is a 503.
    """
    question = request.question.strip()

    try:
        retrieval = await retrieve(question)
        result = await generate_answer(question, retrieval.hits)
    except EmbeddingError as error:
        raise HTTPException(status_code=503, detail=error.message) from None
    except GenerationError as error:
        raise HTTPException(status_code=503, detail=error.message) from None

    logger.info(
        "Answered=%s hits=%d best=%.3f question=%r",
        result.answered,
        len(retrieval.hits),
        retrieval.best_score,
        question[:80],
    )

    return AnswerResponse(
        question=question,
        answer=result.answer,
        answered=result.answered,
        sources=result.citations,
        model=result.model,
    )
