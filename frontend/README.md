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
report `Lidhur me serverin`. See [../backend/README.md](../backend/README.md).

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
│   ├── components/
│   │   ├── ui/               # shadcn/ui components
│   │   ├── animate-ui/       # Animate UI components
│   │   ├── MicButton.tsx     # push-to-talk control
│   │   ├── Notice.tsx        # error and status banner
│   │   └── QuestionBubble.tsx
│   ├── hooks/
│   │   ├── useAudioRecorder.ts
│   │   └── useTranscription.ts
│   ├── lib/
│   │   ├── api.ts            # backend client
│   │   └── loudness.ts       # silence detection
│   ├── App.tsx
│   └── index.css             # theme variables
├── components.json
├── vite.config.ts
└── .env.example
```

## Silence detection

Recordings are measured before upload and discarded when they contain no
speech — see [src/lib/loudness.ts](src/lib/loudness.ts) for the thresholds and
why the check exists. Removing it does not merely waste an API call: the
transcription model answers silence with an invented question rather than an
empty string.
