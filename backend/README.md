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

### `POST /search`

Searches the Knowledge Base and applies the relevance gate.

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Sa ditë pushimi vjetor kam?", "limit": 3}'
```

```json
{
  "query": "Sa ditë pushimi vjetor kam?",
  "relevant": true,
  "best_score": 0.826,
  "documents": ["Pyetje të Shpeshta", "Politika e Pushimeve dhe e Lejeve"],
  "hits": [{ "document_title": "…", "heading": "…", "text": "…", "score": 0.826 }]
}
```

`relevant` is `false` with an empty `hits` list when nothing in the corpus was
close enough. `best_score` is the best similarity *before* filtering, so a
near-miss is distinguishable from a query that matched nothing at all.

**The gate is one layer, not the whole guardrail.** It decides whether
anything is worth reading, not whether the question can be answered — some
out-of-scope questions land close enough to pass and are refused later, by the
grounding step. The threshold in
[app/services/retrieval.py](app/services/retrieval.py) is measured against a
set of in-scope and out-of-scope Albanian questions; the comment there records
what moving it costs.

### `POST /answer`

Retrieves passages and answers from them, or refuses.

```bash
curl -X POST http://localhost:8000/answer \
  -H "Content-Type: application/json" \
  -d '{"question": "Nga 30 ditët e pushimit vjetor, sa mund të bart?"}'
```

```json
{
  "question": "Nga 30 ditët e pushimit vjetor, sa mund të bart?",
  "answer": "Pushimi vjetor është 21 ditë pune në vit, jo 30. Prej tyre mund të barten maksimumi 5 ditë…",
  "answered": true,
  "sources": ["Politika e Pushimeve dhe e Lejeve › 2. Grumbullimi dhe bartja e ditëve"],
  "model": "gpt-4o"
}
```

A refusal is a **successful** response — `answered` is `false` and `answer`
carries the Albanian message. Only a provider failure returns `503`.

## The three guardrail layers

Each layer catches something the others cannot, and none is sufficient alone.

**1. Relevance gate** — [retrieval.py](app/services/retrieval.py). Filters
questions with nothing close enough in the corpus. Measured against in-scope
and out-of-scope question sets; it deliberately lets borderline questions
through rather than refusing valid ones.

**2. Grounded prompt** — [generation.py](app/services/generation.py). The
model answers only from the supplied passages, reports when it cannot, and
corrects a false premise instead of refusing it.

**3. Citation verification** — same file. The model cites passages by number;
anything outside the supplied set is dropped, and an answer left with no
verifiable citation is discarded and becomes a refusal. This is what makes a
citation a fact rather than a claim.

Measured over the question sets in
[docs/sample-documents/README.md](../docs/sample-documents/README.md):

| | Result |
| --- | --- |
| In-scope questions answered correctly | 8/8 |
| False premises corrected | 3/3 |
| Out-of-scope questions refused | 6/6 |

Three of the six out-of-scope questions clear the relevance gate and are
stopped by grounding — which is the layering working as intended.

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
| `ANSWER_MODEL` | no | Defaults to `gpt-4o` |

## Layout

```
backend/
├── app/
│   ├── routers/
│   │   ├── answer.py          # POST /answer
│   │   ├── search.py          # POST /search
│   │   └── transcription.py   # POST /transcribe
│   ├── services/
│   │   ├── chunking.py        # heading-aware document splitting
│   │   ├── embeddings.py      # text-embedding-3-small
│   │   ├── generation.py      # grounded answers + citation verification
│   │   ├── indexing.py        # embed stored chunks into the vector index
│   │   ├── ingestion.py       # read, chunk, store
│   │   ├── openai_client.py   # shared provider client
│   │   ├── retrieval.py       # semantic search + relevance gate
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
