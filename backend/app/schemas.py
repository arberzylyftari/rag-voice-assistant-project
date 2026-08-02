"""Response models for the public API."""

from pydantic import BaseModel, Field

from app.services.followup import Turn


class TranscriptionResponse(BaseModel):
    """A transcribed voice question."""

    text: str = Field(description="The transcribed question, in Albanian.")
    model: str = Field(description="Speech-to-text model that produced it.")


class SearchRequest(BaseModel):
    """A Knowledge Base query."""

    query: str = Field(min_length=1, max_length=1000, description="The question, in Albanian.")
    limit: int = Field(default=5, ge=1, le=20, description="Maximum passages to return.")


class SearchHitResponse(BaseModel):
    """One retrieved passage."""

    document_title: str
    heading: str
    text: str
    score: float = Field(description="Similarity, 0 to 1.")


class AnswerRequest(BaseModel):
    """A question to answer from the Knowledge Base."""

    question: str = Field(min_length=1, max_length=1000, description="The question, in Albanian.")
    history: list[Turn] = Field(
        default_factory=list,
        max_length=40,
        description=(
            "Earlier turns in this conversation, oldest first. Used only to "
            "resolve a follow-up into a standalone question — never as a "
            "source of facts."
        ),
    )


class AnswerResponse(BaseModel):
    """A grounded answer, or a refusal."""

    question: str
    resolved_question: str = Field(
        description=(
            "The question after follow-up resolution — what retrieval "
            "actually ran on. Equal to `question` when nothing was rewritten."
        )
    )
    answer: str = Field(description="The answer in Albanian, or the refusal message.")
    answered: bool = Field(
        description="False when the Knowledge Base does not support an answer."
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Headings of the passages the answer was drawn from.",
    )
    model: str


class SearchResponse(BaseModel):
    """Retrieval results and whether they cleared the relevance gate."""

    query: str
    relevant: bool = Field(
        description="False when nothing in the Knowledge Base was close enough."
    )
    best_score: float = Field(description="Best similarity seen, before filtering.")
    documents: list[str] = Field(description="Distinct source documents that were hit.")
    hits: list[SearchHitResponse]
