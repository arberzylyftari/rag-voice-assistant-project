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

## Knowledge Base index

Build the index from the documents in `docs/sample-documents/`:

```bash
python scripts/reindex.py             # ingest and index what changed
python scripts/reindex.py --force     # re-ingest and re-embed everything
python scripts/reindex.py --no-embed  # parse and store only, no API calls
```

Documents are split at heading boundaries — a `##` section becomes one chunk
unless it has `###` subsections, in which case each becomes its own. The
heading path travels with the text into the embedding, so a passage carries
the words that make it findable. See
[app/services/chunking.py](app/services/chunking.py).

Chunks are embedded with `text-embedding-3-small` and stored in ChromaDB
under cosine distance.

Unchanged documents are skipped by checksum. A document also records the
checksum it was last *embedded* at, so a failed or interrupted embedding run
leaves it pending rather than silently missing from the index.

Storage lives under `data/` — `knowledge_base.sqlite` for metadata and chunk
text, `chroma/` for the vectors. Both are gitignored and rebuilt by the script.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

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
│   ├── routers/
│   │   └── transcription.py   # POST /transcribe
│   ├── services/
│   │   ├── chunking.py        # heading-aware document splitting
│   │   ├── embeddings.py      # text-embedding-3-small
│   │   ├── indexing.py        # embed stored chunks into the vector index
│   │   ├── ingestion.py       # read, chunk, store
│   │   ├── openai_client.py   # shared provider client
│   │   ├── transcription.py   # speech-to-text
│   │   └── vector_store.py    # ChromaDB
│   ├── config.py              # environment-driven settings
│   ├── db.py                  # SQLite schema and connections
│   ├── main.py                # FastAPI app, CORS, /health
│   └── schemas.py
├── scripts/
│   └── reindex.py             # rebuild the Knowledge Base index
├── data/                      # SQLite + Chroma (gitignored)
├── tests/
├── requirements.txt
├── requirements-dev.txt
└── .env.example
```
