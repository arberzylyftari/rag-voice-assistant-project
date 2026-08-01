# Frontend — RAG Voice Assistant

React + Vite + TypeScript single-page app. The interface is entirely in
Albanian; the code, comments and documentation are in English.

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
│   │   └── MicButton.tsx   # push-to-talk control (UI state only for now)
│   ├── lib/
│   │   └── api.ts          # backend client
│   ├── App.tsx             # layout, connection status
│   └── index.css           # design tokens, light/dark theme
├── vite.config.ts
└── .env.example
```
