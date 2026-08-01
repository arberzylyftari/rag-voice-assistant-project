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

## Endpoints

### `POST /transcribe`

Transcribes a recorded Albanian question. Send `multipart/form-data` with an
`audio` field; `webm`, `ogg`, `mp4`, `mp3`, `wav` and `flac` are accepted, up
to 25 MB.

```bash
curl -X POST http://localhost:8000/transcribe \
  -F "audio=@question.webm;type=audio/webm"
# {"text":"Sa ditë pushimi vjetor kam?","model":"gpt-4o-transcribe"}
```

Errors return `{"detail": "<message in Albanian>"}` — the frontend displays
`detail` as-is. Status codes: `400` empty, too short, or malformed audio;
`413` over the size limit; `415` unsupported container; `422` no speech
detected; `503`/`504` provider unavailable or timed out.

**Albanian is steered with a prompt, not the `language` parameter** — the
transcription API rejects the `sq` code. See `stt_prompt` in
[app/config.py](app/config.py); removing it drops accuracy sharply.

## Environment variables

See [.env.example](.env.example). Secrets are read on the backend only and are
never exposed to the frontend.

| Variable | Required | Description |
| --- | --- | --- |
| `APP_ENV` | no | `development` or `production` |
| `CORS_ORIGINS` | no | Comma-separated allowed browser origins (defaults to the frontend dev server on port 5180) |
| `OPENAI_API_KEY` | yes | Speech-to-text, LLM, embeddings |
| `ELEVENLABS_API_KEY` | yes (from TTS milestone) | Text-to-speech |
| `STT_MODEL` | no | Defaults to `gpt-4o-transcribe`; set to `whisper-1` to fall back |

## Layout

```
backend/
├── app/
│   ├── config.py   # environment-driven settings
│   └── main.py     # FastAPI app, CORS, /health
├── requirements.txt
└── .env.example
```
