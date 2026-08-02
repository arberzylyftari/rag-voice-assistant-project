# Backend — RAG Voice Assistant API

FastAPI service handling speech-to-text, retrieval over the Knowledge Base,
grounded answer generation, text-to-speech, and document management.

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
pytest                                     # 127 tests, no API calls
```

Providers are stubbed throughout, so the suite costs nothing to run.

The speech-to-text evaluation is separate, because it does make API calls:

```bash
python scripts/evaluate_stt.py             # 100 clips, both configurations
python scripts/evaluate_stt.py --limit 475 # the whole test split
```

It downloads the Albanian test split of Mozilla Common Voice 17.0 on first run
and caches it under `data/stt-eval/`. See
[Accuracy on real speech](#accuracy-on-real-speech).

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
[app/config.py](app/config.py), and the measurements below.

#### Accuracy on real speech

`gpt-4o-transcribe` over the **475-clip Albanian test split of Mozilla Common
Voice 17.0** — recordings of people reading, not synthetic audio. Reproduce it
with:

```bash
python scripts/evaluate_stt.py --limit 475
```

| | WER | CER | Mean similarity | Exact |
| --- | --- | --- | --- | --- |
| **With the Albanian prompt** | **0.244** | **0.095** | **0.914** | 36.8% |
| Without any prompt | 0.354 | 0.166 | 0.808 | 29.1% |

Word and character error rates are pooled over the corpus rather than averaged
per clip. Mean similarity is reported too, because it is the metric this
project's earlier synthetic figures used and it makes the two comparable.
Repeat runs agree to within 0.003.

**The prompt helps, but roughly a third as much as synthetic fixtures
suggested.** Those measured 0.96 with the prompt against 0.64 without — a gap
of 0.32. On real speech the gap is 0.11. The prompt is still load-bearing:
without it, short clips come back in Cyrillic (*"Ja se pse."* → *"Ясепсен."*),
which is the same language-misdetection failure the synthetic fixtures showed.

**Errors concentrate on very short utterances**, which matters because the
system's real input is a spoken question rather than an isolated word:

| Reference length | Clips | WER | Mean similarity |
| --- | --- | --- | --- |
| 1–2 words | 49 | 0.577 | 0.843 |
| 3–4 words | 98 | 0.351 | 0.892 |
| 5+ words | 328 | 0.222 | 0.931 |
| 8+ words | 196 | 0.213 | 0.935 |

**The prompt also causes fabrication, at a measurable rate.** On a clip it
cannot make out, the model falls back on the prompt's vocabulary and returns a
fluent, in-domain phrase. Of 475 clips, 5 (1.1%) came back fluent but
unrelated to what was said — *"tri"* transcribed as *"pushimet,"*, *"Kishin të
gjitha llojet e zbritjeve."* as *"Pushimet dhe politikat."* The prompt-echo
filter caught only 1 (0.2%), because these are new inventions rather than
quotations of the prompt. This is the hazard recorded in the decision log,
now quantified: the filter is a partial defence, and the frontend energy gate
is what keeps most wordless audio from reaching the model at all.

**What this still does not measure.** Common Voice is *read* speech, mostly
short general-domain sentences — not spontaneous questions about company
policy. The steering prompt is tuned for HR and IT vocabulary the corpus does
not contain, which likely understates its benefit for real in-domain questions
while overstating the fabrication rate. Accent and dialect coverage is whatever
the 155 contributors happen to represent, and is not broken out.

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

#### Follow-up questions

Pass the earlier turns and a follow-up resolves against them:

```json
{
  "question": "Po pas pesë vjetësh?",
  "history": [
    { "role": "user", "content": "Sa ditë pushimi vjetor kam?" },
    { "role": "assistant", "content": "21 ditë pune në vit…" }
  ]
}
```

`resolved_question` comes back as
`Sa ditë pushimi vjetor kam pas pesë vjetësh punë?` — what retrieval actually
ran on.

**History resolves the question; it never answers it.** Retrieval and
generation both run on the resolved form, so no fact carries over from an
earlier turn without being fetched again for this one. Without the rewrite the
alternative would be feeding earlier answers to the model as context, which is
exactly the leak the grounding rules exist to prevent.

History is supplied by the caller rather than held server-side, so the API
stays stateless — no session store, no expiry.

### `POST /speak`

Returns MP3 audio for Albanian text.

```bash
curl -X POST http://localhost:8000/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Pushimi vjetor eshte 21 dite pune ne vit."}' \
  --output answer.mp3
```

Separate from `/answer` so the text reaches the user immediately and the audio
follows, rather than the whole turn waiting on synthesis.

**No provider officially supports Albanian text-to-speech.** ElevenLabs does
not list it among the 74 languages of `eleven_v3`; Azure marks `sq-AL`
explicitly unsupported for TTS while supporting it for speech-to-text; Google
does not carry it. OpenAI does not list it either, but measurably produces
intelligible Albanian — round-tripping real answers through synthesis and back
through transcription gives 0.96–0.99 fidelity.

That measures intelligibility to a machine, not naturalness to a native
speaker: pronunciation and prosody are audibly non-native. See
[app/services/speech.py](app/services/speech.py) for the voice comparison and
why an Albanian pronunciation instruction is sent with every request.

### Admin document endpoints

Gated by a shared secret in `X-Admin-Token`. **An unset `ADMIN_TOKEN` disables
them** — a deployed demo with unauthenticated upload and delete is worse than
one without an admin panel.

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:8000/admin/documents

curl -X POST http://localhost:8000/admin/documents \
  -H "X-Admin-Token: $ADMIN_TOKEN" -F "file=@politika.docx"

curl -X DELETE http://localhost:8000/admin/documents/3 \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

`PDF`, `DOCX`, `TXT` and `MD` up to 10 MB. Indexing completes before the upload
returns, so the document is answerable immediately.

Chunking keys on headings, so parsing recovers structure rather than just text:
Word heading styles map to Markdown levels, and PDF/TXT headings are recovered
from shape — short lines that do not end like a sentence. A document with no
headings, or one that yields no chunks, is rejected rather than indexed as an
unsearchable blob.

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
| `STT_MODEL` | no | Defaults to `gpt-4o-transcribe`; set to `whisper-1` to fall back |
| `ANSWER_MODEL` | no | Defaults to `gpt-4o` |
| `REWRITE_MODEL` | no | Follow-up resolution; defaults to `gpt-4o-mini` |
| `TTS_VOICE` | no | Defaults to `alloy`; `shimmer` and `fable` scored equally |
| `ADMIN_TOKEN` | no | Shared secret for `/admin/*`. Unset disables those endpoints |

## Layout

```
backend/
├── app/
│   ├── routers/
│   │   ├── admin.py           # /admin/documents
│   │   ├── answer.py          # POST /answer
│   │   ├── search.py          # POST /search
│   │   ├── speech.py          # POST /speak
│   │   └── transcription.py   # POST /transcribe
│   ├── services/
│   │   ├── chunking.py        # heading-aware document splitting
│   │   ├── documents.py       # PDF/DOCX/TXT parsing
│   │   ├── library.py         # document management
│   │   ├── embeddings.py      # text-embedding-3-small
│   │   ├── followup.py        # resolves a follow-up into a standalone question
│   │   ├── generation.py      # grounded answers + citation verification
│   │   ├── indexing.py        # embed stored chunks into the vector index
│   │   ├── ingestion.py       # read, chunk, store
│   │   ├── openai_client.py   # shared provider client
│   │   ├── retrieval.py       # semantic search + relevance gate
│   │   ├── speech.py          # text-to-speech
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
