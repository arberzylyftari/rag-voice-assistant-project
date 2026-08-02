"""Semantic search over the Knowledge Base, with the relevance gate.

This is the first of the three guardrail layers. It does not decide whether a
question can be *answered* — only whether anything in the corpus is close
enough to be worth reading. Grounding and output validation come after.
"""

import logging
from dataclasses import dataclass

from app.services import vector_store
from app.services.embeddings import embed_query
from app.services.vector_store import SearchHit

logger = logging.getLogger(__name__)

# Below this similarity, nothing retrieved is worth passing on.
#
# Measured, not guessed. Over 24 in-scope and 12 out-of-scope Albanian
# questions, 0.75 accepts every in-scope question — no valid question is
# refused — while filtering 9 of the 12 out-of-scope ones.
#
# Raising it starts rejecting real questions before it filters much more:
# at 0.79 all 12 out-of-scope are gone, but so are 3 valid ones, including
# "Si e rivendos fjalëkalimin?" which the corpus answers directly.
#
# The three that get through score 0.766-0.783 against passages that plainly
# do not answer them, which is what the grounding layer is for. A gate this
# shallow cannot tell "close subject" from "answers the question", and
# pretending otherwise would cost real questions.
RELEVANCE_THRESHOLD = 0.75

# Passages handed to the answering step. Enough for a question whose answer
# spans documents, short enough to keep the prompt focused.
DEFAULT_LIMIT = 5

# Candidates pulled before filtering, so a strong hit is not crowded out.
CANDIDATE_MULTIPLIER = 3


@dataclass
class RetrievalResult:
    """What search found, and whether it clears the gate."""

    query: str
    hits: list[SearchHit]
    # The best score seen, including candidates that did not clear the gate.
    # Kept for logging: a stream of near-misses means the threshold is wrong.
    best_score: float

    @property
    def is_relevant(self) -> bool:
        return bool(self.hits)

    @property
    def documents(self) -> list[str]:
        """Distinct source documents, in the order they were first hit."""
        seen: list[str] = []
        for hit in self.hits:
            if hit.document_title not in seen:
                seen.append(hit.document_title)
        return seen


async def retrieve(query: str, limit: int = DEFAULT_LIMIT) -> RetrievalResult:
    """Search the Knowledge Base and apply the relevance gate."""
    cleaned = query.strip()

    if not cleaned:
        return RetrievalResult(query=query, hits=[], best_score=0.0)

    embedding = await embed_query(cleaned)
    candidates = vector_store.search(embedding, limit * CANDIDATE_MULTIPLIER)

    if not candidates:
        return RetrievalResult(query=cleaned, hits=[], best_score=0.0)

    best_score = candidates[0].score
    hits = [hit for hit in candidates if hit.score >= RELEVANCE_THRESHOLD][:limit]

    if not hits:
        logger.info(
            "Relevance gate rejected a query (best score %.3f): %s", best_score, cleaned
        )

    return RetrievalResult(query=cleaned, hits=hits, best_score=best_score)
