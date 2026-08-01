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
    elevenlabs_api_key: str | None = None

    # Local, file-based storage root (SQLite metadata + Chroma index).
    data_dir: Path = BACKEND_DIR / "data"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse `cors_origins` into a list of origins."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
