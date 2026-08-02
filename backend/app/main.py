"""FastAPI application entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, answer, search, transcription

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Backend for an Albanian-language voice assistant answering questions "
        "grounded in an internal company Knowledge Base."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(transcription.router)
app.include_router(search.router)
app.include_router(answer.router)
app.include_router(admin.router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness probe used by the frontend and by deployment health checks."""
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
    }
