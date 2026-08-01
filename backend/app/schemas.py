"""Response models for the public API."""

from pydantic import BaseModel, Field


class TranscriptionResponse(BaseModel):
    """A transcribed voice question."""

    text: str = Field(description="The transcribed question, in Albanian.")
    model: str = Field(description="Speech-to-text model that produced it.")
