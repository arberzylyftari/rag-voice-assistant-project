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
npm run dev       # dev server on http://localhost:5180
npm run build     # type-check and production build
npm run lint      # oxlint
npm run test:e2e  # Playwright browser tests
npm run preview   # serve the production build locally
```

The backend must be running and its Knowledge Base index must be built before
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

## Hands-free mode

The "Bisede e vazhdueshme" switch below the mic turns push-to-talk into a
continuous listen → answer → speak → listen loop, the way ChatGPT's voice mode
works. Push-to-talk itself is untouched — this only changes what happens once
the switch is on.

Flip it on and it starts listening immediately. Recording ends itself once you
have spoken and then paused, rather than waiting for a second button press: a
live voice-activity detector (`watchVoiceActivity` in
[lib/loudness.ts](src/lib/loudness.ts)) samples the raw microphone stream via
an `AnalyserNode` — a second consumer of the same `MediaStream` `MediaRecorder`
is reading, so it does not affect what gets recorded — and calls back once RMS
has crossed a speech threshold and then stayed below it for 1.2 seconds. There
is deliberately no "nothing was said" timeout of its own: if you never speak,
it just keeps waiting, and the recorder's existing 60-second cap is what ends
that case, so a silent turn costs one message a minute rather than a repeating
one every few seconds.

Once the answer has been read aloud — or synthesis fails, or the browser
blocks autoplay — listening resumes on its own. The mic never listens while
the assistant is talking, so it cannot pick up its own voice through the
speakers; the button shows a "Duke folur pergjigjen…" state for that gap and
is the one control that stays clickable through it, so pressing it there
always exits hands-free mode even mid-answer.

**One speaker at a time — the assistant is never interrupted.** True
full-duplex, where you can talk over it the way ChatGPT's Advanced Voice Mode
allows, needs a different backend transport (OpenAI's Realtime API over a
WebSocket) and has no clean place to run citation verification before
anything is spoken — which is what makes a citation here a fact rather than a
claim. It was considered and deliberately left out; see `context/decisions.md`.

If the microphone itself fails once hands-free is on — permission denied,
unsupported browser — the mode turns itself back off rather than retrying in
a loop; the usual Albanian error banner explains why.

## Conversation history

Conversations are listed in a sidebar and can be reopened. They are stored in
`localStorage` under the `conversations` key, which keeps the API stateless —
history is still sent by the client on every `/answer` call, exactly as it was
before the sidebar existed.

Storing them client-side is a deliberate choice rather than the lazy one. A
single table behind an API with no user accounts would show every visitor to
the public demo the conversations of every other visitor; making that safe
means issuing each browser an identifier, which is what `localStorage` already
is. See [lib/conversations.ts](src/lib/conversations.ts).

Only completed turns are saved. A failed or in-flight exchange has nothing
worth reopening, so it lives and dies with the session.

**Recordings are not stored.** They exist as object URLs, which do not survive
a reload, and keeping the audio itself would mean a second storage layer for
the least valuable part of the turn — the transcript sits directly above it. A
reopened conversation therefore shows no player on its questions. The *answer*
is unaffected: `/speak` synthesises it on demand, so reopened answers still
read aloud. They do not read aloud *by themselves*, though — autoplay is for an
answer that has just arrived, not one being reviewed.

Titles come from the opening question, truncated at a word boundary. Albanian
questions are already self-describing — "Sa dite pushimi vjetor kam?" needs no
summarising — so a generated title would cost a round trip and a title-less
state to buy very little.

Fifty conversations are kept, oldest dropped first. Unreadable stored entries
are discarded rather than thrown, so a shape written by an older build costs
the history rather than the ability to open the page.

### Recording lifetime

The recorder creates an object URL per recording but does not own it; the
conversation does, and frees them when it is closed or the page unmounts. This
matters: the recorder previously revoked the previous URL each time it made a
new one, while the conversation went on rendering an `<audio>` element for
every earlier turn — so every question but the newest pointed at a freed
resource.

## Tests

```bash
npx playwright install chromium   # once
npm run test:e2e                  # 49 tests
npm run test:e2e:ui               # watch mode, for writing them
```

**The backend is stubbed at the network boundary in every spec**, so the suite
needs no API key, makes no provider calls and costs nothing — the same
property the backend's `pytest` suite has. What is under test is the
interface: what it renders, what it sends, and how it behaves when a request
fails. The dev server is started by Playwright, or reused if one is already
running.

| File | Covers |
| --- | --- |
| [conversation.spec.ts](e2e/conversation.spec.ts) | Record → transcribe → answer, sources, follow-up history, resolved questions, refusal styling, speech |
| [history.spec.ts](e2e/history.spec.ts) | Saving, titles, reload, reopening, deletion, recency groups, unreadable storage |
| [recording.spec.ts](e2e/recording.spec.ts) | Microphone errors, the silence gate, the timer |
| [errors.spec.ts](e2e/errors.spec.ts) | Backend failures on each route, and recovery |
| [admin.spec.ts](e2e/admin.spec.ts) | Token gate, listing, upload, deletion, sign-out |
| [theme.spec.ts](e2e/theme.spec.ts) | System preference, stored choice, pre-paint application |
| [hands-free.spec.ts](e2e/hands-free.spec.ts) | Starting, stopping, push-to-talk unaffected, a broken microphone turning the mode back off |
| [hands-free-vad.spec.ts](e2e/hands-free-vad.spec.ts) | The voice-activity detector against real recorded speech, not a stand-in for it — see below |

`hands-free-vad.spec.ts` runs under its own Playwright project
(`chromium-real-audio`), launched with `--use-file-for-fake-audio-capture`
pointed at [e2e/fixtures/speech-then-silence.wav](e2e/fixtures/speech-then-silence.wav)
— a real Albanian utterance from the Common Voice corpus used in
`scripts/evaluate_stt.py`, looped with pauses between repeats. The network is
still stubbed; only the microphone input is real. This is what lets the test
assert that recording stops itself on a genuine pause in genuine speech,
rather than asserting that a mocked function was called.

### Writing more of them

Things that cost time to work out the first time:

- **Both fake-media flags are required.** `--use-fake-device-for-media-stream`
  alone leaves `getUserMedia` failing with `NotSupportedError`; it needs
  `--use-fake-ui-for-media-stream` too. Both are in
  [playwright.config.ts](playwright.config.ts).
- **A denied microphone cannot be tested by withholding the permission**,
  because that second flag auto-accepts every prompt. Reject at
  `navigator.mediaDevices.getUserMedia` instead — the mapping from
  `error.name` to an Albanian message is the thing worth testing anyway.
- **Answers are revealed by `TypingText`**, so an assertion made the moment a
  bubble appears reads a partial string. `settle()` polls until the text stops
  growing.
- **Scope text assertions to the chat region.** A saved conversation's title
  repeats its opening question in the sidebar, so an unscoped `getByText` for
  a question matches twice. Same trap on the admin page, where the success
  notice repeats the document title.
- **The chat panel is itself a `[data-slot="card"]`**, so bubbles are
  `[data-slot="card"] [data-slot="card"]`.
- **The mic button's accessible name changes with its state.** Find it with
  `button[aria-pressed]`.
- **Radix dialogs animate out and stay mounted while they do.** Cancelling and
  immediately reopening one can land the second interaction on the closing
  copy, whose state is already cleared. Wait for it to be hidden, or split the
  test.
- A recording under 700 ms is discarded as silence before it is ever uploaded,
  so `ask()` records for longer than that.
- **Chrome's fake-audio-capture appears to advance through the fixture file
  at wall-clock speed for as long as the browser process lives, not reset
  per recording.** A second real-audio test in the same worker inherited a
  playback position already past the speech and into trailing silence, and
  never observed speech at all. `hands-free-vad.spec.ts` is deliberately the
  only test in its file so it is always the first thing to touch that
  browser's fake microphone; the fixture also loops with pauses, so a test
  is never more than one cycle away from a full speech-then-pause transition
  regardless of when in wall-clock time it starts listening.
- **`recorder.status` has a `'finalising'` value between a recording actually
  stopping and the decision on whether it held real speech** — that decision
  requires decoding the audio, which is async. Code that starts a new
  recording as soon as `status !== 'recording'` (hands-free mode did, at
  first) can start one on top of a turn whose outcome has not landed yet;
  the correct guard is `status === 'idle'`.

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
│   │   ├── ConversationSidebar.tsx  # saved conversations
│   │   ├── MicButton.tsx     # push-to-talk control
│   │   ├── ThemeProvider.tsx # theme state + wipe transition
│   │   ├── ThemeToggle.tsx
│   │   ├── Notice.tsx        # error and status banner
│   │   └── QuestionBubble.tsx
│   ├── hooks/
│   │   ├── useAudioRecorder.ts
│   │   ├── useConversation.ts
│   │   ├── useHandsFree.ts   # the listen -> answer -> speak -> listen loop
│   │   ├── useAdminToken.ts
│   │   ├── useTheme.ts
│   │   └── useSpeech.ts
│   ├── lib/
│   │   ├── api.ts            # backend client
│   │   ├── conversations.ts  # saved conversations in localStorage
│   │   └── loudness.ts       # silence detection + live voice-activity detection
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
