"""Turn chunk text into vectors with the OpenAI embeddings API."""

import logging
from collections.abc import Iterator

import openai

from app.config import get_settings
from app.services.openai_client import OpenAINotConfigured, get_client

logger = logging.getLogger(__name__)

MESSAGES = {
    "not_configured": "Sherbimi i indeksimit nuk eshte i konfiguruar. Kontakto administratorin.",
    "overloaded": "Sherbimi i indeksimit eshte i mbingarkuar. Provo serish pas pak.",
    "unreachable": "Nuk u arrit lidhja me sherbimin e indeksimit. Provo serish.",
    "failed": "Indeksimi i dokumentit deshtoi. Provo serish.",
}


class EmbeddingError(Exception):
    """A failure with a message the admin can act on."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _batches(items: list[str], size: int) -> Iterator[list[str]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts, preserving order.

    Sent in batches so one failure costs a batch rather than the whole
    document set.
    """
    if not texts:
        return []

    settings = get_settings()

    try:
        client = get_client()
    except OpenAINotConfigured:
        raise EmbeddingError(MESSAGES["not_configured"]) from None

    vectors: list[list[float]] = []

    for batch in _batches(texts, settings.embedding_batch_size):
        try:
            response = await client.embeddings.create(
                model=settings.embedding_model,
                input=batch,
            )
        except openai.AuthenticationError:
            logger.exception("Embeddings rejected the API key")
            raise EmbeddingError(MESSAGES["not_configured"]) from None
        except openai.RateLimitError:
            logger.warning("Embeddings rate limited")
            raise EmbeddingError(MESSAGES["overloaded"]) from None
        except (openai.APIConnectionError, openai.APITimeoutError):
            logger.exception("Could not reach the embeddings API")
            raise EmbeddingError(MESSAGES["unreachable"]) from None
        except openai.APIStatusError:
            logger.exception("Embeddings returned an error status")
            raise EmbeddingError(MESSAGES["failed"]) from None

        # The API may return items out of order; `index` is authoritative.
        vectors.extend(item.embedding for item in sorted(response.data, key=lambda i: i.index))

    return vectors


async def embed_query(text: str) -> list[float]:
    """Embed a single search query."""
    vectors = await embed_texts([text])

    if not vectors:
        raise EmbeddingError(MESSAGES["failed"])

    return vectors[0]
