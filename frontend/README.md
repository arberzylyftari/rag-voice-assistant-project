# Frontend — RAG Voice Assistant

React + Vite + TypeScript single-page app. The interface is entirely in
Albanian; the code, comments and documentation are in English.

## UI components

All interface components come from **shadcn/ui** and **Animate UI** — buttons,
alerts, cards and badges are library components, and colours come from the
theme variables in [src/index.css](src/index.css). Tailwind utilities handle
layout; there are no bespoke stylesheets.

```bash
npx shadcn@latest add <component>              # shadcn/ui
npx shadcn@latest add @animate-ui/<component>  # Animate UI
```

Animate UI ships components with an unused `React` import, which the project's
`noUnusedLocals` setting rejects. Drop that line from newly added files whose
body never references `React`.

## Setup

```bash
cd frontend

npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if the backend is elsewhere
```

## Run

```bash
npm run dev      # dev server on http://localhost:5180
npm run build    # type-check and production build
npm run lint     # oxlint
npm run preview  # serve the production build locally
```

The backend must be running for the connection indicator in the header to
report `Lidhur me serverin`, and its Knowledge Base index must be built before
questions can be answered. See [../backend/README.md](../backend/README.md).

## The conversation loop

Pressing the microphone records a question; the recording is transcribed, the
transcript is answered from the Knowledge Base, and the answer appears with the
passages it came from.

Follow-ups work: the completed exchanges are sent with each question so the
backend can resolve `Po pas pesë vjetësh?` into a standalone question. The
resolved form is shown above the answer whenever it differs, so an answer that
mentions five years' service is traceable to what was actually asked.

A refusal is styled apart from an answer — muted, italic, no sources — because
"we do not cover this" should not read like a finding.

The newest answer reads itself aloud on arrival; every answer keeps a play
control. Audio is fetched once and reused, so replaying costs nothing. Autoplay
is attempted but never assumed — browsers block it without a prior gesture, and
a blocked attempt leaves the control ready to press.

## Dev server port

The dev server is pinned to **5180** with `strictPort: true`. This port is
part of the backend CORS allowlist — if you change it, change `CORS_ORIGINS`
on the backend to match, otherwise the browser will block every API call.

## Environment variables

Only `VITE_`-prefixed variables are exposed to the browser. No secrets belong
here — API keys live on the backend only.

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL of the backend API |

## Layout

```
frontend/
├── src/
│   ├── pages/
│   │   ├── ChatPage.tsx      # the conversation
│   │   └── AdminPage.tsx     # document management
│   ├── components/
│   │   ├── admin/            # upload panel, document table
│   │   ├── ui/               # shadcn/ui components
│   │   ├── animate-ui/       # Animate UI components
│   │   ├── AnswerBubble.tsx  # answer + collapsible sources
│   │   ├── Conversation.tsx  # the exchanges so far
│   │   ├── MicButton.tsx     # push-to-talk control
│   │   ├── ThemeProvider.tsx # theme state + wipe transition
│   │   ├── ThemeToggle.tsx
│   │   ├── Notice.tsx        # error and status banner
│   │   └── QuestionBubble.tsx
│   ├── hooks/
│   │   ├── useAudioRecorder.ts
│   │   ├── useConversation.ts
│   │   ├── useAdminToken.ts
│   │   ├── useTheme.ts
│   │   └── useSpeech.ts
│   ├── lib/
│   │   ├── api.ts            # backend client
│   │   └── loudness.ts       # silence detection
│   └── index.css             # theme variables
├── components.json
├── vite.config.ts
└── .env.example
```

## Theme

Light and dark, resolved from a stored choice and falling back to the system
preference. An inline script in `index.html` applies the class before first
paint, so a reload never flashes the wrong theme.

Switching runs a wipe: a full-viewport panel sweeps across, and the theme
swaps only once it covers everything, so the change itself is never visible —
black left-to-right going dark, white right-to-left coming back. The panel is
`pointer-events-none` throughout and sits above dialogs and fixed elements.
`prefers-reduced-motion` skips it and swaps instantly.

Lives in [ThemeProvider.tsx](src/components/ThemeProvider.tsx) and
[lib/theme.ts](src/lib/theme.ts); the button is
[ThemeToggle.tsx](src/components/ThemeToggle.tsx).

## Admin panel

`/admin` manages the Knowledge Base — a separate route, not a mode of the chat
page, because uploading and deleting documents is not something a user does
mid-conversation.

It asks for the backend's `ADMIN_TOKEN` and holds it in `sessionStorage`, so
closing the tab ends access rather than leaving a shared secret on disk. The
backend disables `/admin/*` entirely when no token is configured.

Upload accepts PDF, DOCX, TXT and MD by drop or picker. A document is indexed
before the upload returns, so it answers questions as soon as it appears in the
table. Deletion asks for confirmation and states what is lost.

## Silence detection

Recordings are measured before upload and discarded when they contain no
speech — see [src/lib/loudness.ts](src/lib/loudness.ts) for the thresholds and
why the check exists. Removing it does not merely waste an API call: the
transcription model answers silence with an invented question rather than an
empty string.
