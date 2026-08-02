"""Application configuration, loaded from environment variables.

Secrets (API keys) live only here, on the backend. They are never sent to
the frontend and never committed — see `.env.example` for the expected keys.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Environment-driven settings for the backend service."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "RAG Voice Assistant API"
    app_version: str = "0.1.0"
    app_env: str = "development"

    # Comma-separated list of allowed browser origins.
    # Default matches the pinned Vite dev server port (see vite.config.ts).
    cors_origins: str = "http://localhost:5180"

    # Provider credentials. Optional at this stage so the skeleton boots
    # without them; the endpoints that need them validate on use.
    openai_api_key: str | None = None

    # Local, file-based storage root (SQLite metadata + Chroma index).
    data_dir: Path = BACKEND_DIR / "data"

    # --- Speech-to-text ---
    # Switchable without code changes: set STT_MODEL=whisper-1 in .env if
    # gpt-4o-transcribe handles Albanian accents poorly.
    stt_model: str = "gpt-4o-transcribe"

    # The transcription API rejects `language="sq"` — Albanian is not in its
    # supported language list. A prompt written in Albanian is what steers it
    # instead, and measured on the Day 2 fixtures it is the difference between
    # 0.64 and 0.96 average accuracy: without it, short clips get misdetected
    # as other languages entirely.
    stt_prompt: str = (
        "Kjo është një pyetje në gjuhën shqipe rreth politikave dhe procedurave "
        "të brendshme të kompanisë, si pushimet, puna nga larg, shpenzimet dhe "
        "mbështetja e IT-së."
    )

    # Upload ceiling, matching the transcription API's own 25 MB limit.
    # The frontend caps recordings at 60 seconds, well under this.
    max_audio_bytes: int = 25 * 1024 * 1024

    # Audio shorter than this is silence, not speech. Mirrors the frontend
    # check so a direct API call cannot bypass it.
    min_audio_bytes: int = 1024

    openai_timeout_seconds: float = 60.0

    # --- Retrieval ---
    embedding_model: str = "text-embedding-3-small"

    # Chunks sent per embedding request. The API accepts far more, but a
    # smaller batch keeps a single failure cheap to retry.
    embedding_batch_size: int = 64

    chroma_collection: str = "knowledge_base"

    # --- Answer generation ---
    # gpt-4o over gpt-4o-mini: both answer in-scope questions correctly and
    # refuse out-of-scope ones, but only gpt-4o reliably corrects a false
    # premise instead of refusing. See the decision log.
    answer_model: str = "gpt-4o"

    # Grounded answers should be reproducible: the same passages and the same
    # question ought to give the same answer.
    answer_temperature: float = 0.0

    # Rewriting a follow-up into a standalone question is a simple task, and
    # it sits in front of every conversational turn — the smaller model keeps
    # that latency off the critical path.
    rewrite_model: str = "gpt-4o-mini"

    # --- Text-to-speech ---
    tts_model: str = "gpt-4o-mini-tts"

    # alloy, shimmer and fable all round-tripped Albanian at 1.000 fidelity;
    # onyx was worst at 0.964, misreading "21" as "20 e mijë". alloy is the
    # most neutral of the three for a business assistant.
    tts_voice: str = "alloy"

    # --- Admin ---
    # Shared secret for the document endpoints, sent as X-Admin-Token. Empty
    # disables them entirely rather than leaving them open: a deployed demo
    # with unauthenticated upload and delete is worse than one without an
    # admin panel.
    admin_token: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse `cors_origins` into a list of origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
