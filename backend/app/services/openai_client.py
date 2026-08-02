"""Shared OpenAI client.

Speech-to-text, embeddings and generation all talk to the same provider, so
they share one client and one connection pool. Each service maps
`OpenAINotConfigured` onto its own error type, so a missing key surfaces with
a message that fits where the caller is standing.
"""

from functools import lru_cache

from openai import AsyncOpenAI

from app.config import get_settings


class OpenAINotConfigured(Exception):
    """Raised when no API key is configured."""


@lru_cache
def get_client() -> AsyncOpenAI:
    """Return the cached OpenAI client."""
    settings = get_settings()

    if not settings.openai_api_key:
        raise OpenAINotConfigured

    return AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=settings.openai_timeout_seconds,
    )
