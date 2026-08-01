# Backend — RAG Voice Assistant API

FastAPI service that will handle speech-to-text, retrieval over the Knowledge
Base, grounded answer generation, and text-to-speech.

## Requirements

- **Python 3.13** (pinned — see the decision log; newer versions do not yet
  have wheels for the vector store dependencies)

## Setup

```bash
cd backend

# Create and activate a virtual environment
python3.13 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env   # then fill in the API keys
```

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

| URL | Purpose |
| --- | --- |
| `http://localhost:8000/health` | Health check |
| `http://localhost:8000/docs` | Interactive API documentation |

## Environment variables

See [.env.example](.env.example). Secrets are read on the backend only and are
never exposed to the frontend.

| Variable | Required | Description |
| --- | --- | --- |
| `APP_ENV` | no | `development` or `production` |
| `CORS_ORIGINS` | no | Comma-separated allowed browser origins |
| `OPENAI_API_KEY` | yes (from STT milestone) | Speech-to-text, LLM, embeddings |
| `ELEVENLABS_API_KEY` | yes (from TTS milestone) | Text-to-speech |

## Layout

```
backend/
├── app/
│   ├── config.py   # environment-driven settings
│   └── main.py     # FastAPI app, CORS, /health
├── requirements.txt
└── .env.example
```
