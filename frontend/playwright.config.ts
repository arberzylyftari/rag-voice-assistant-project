import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const PORT = 5180
const BASE_URL = `http://localhost:${PORT}`

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// Real Albanian speech (~3.4s) followed by ~3s of true digital silence, cut
// from the Common Voice corpus used in scripts/evaluate_stt.py. Used only for
// hands-free-vad.spec.ts, to exercise the real voice-activity detector
// against real speech rather than the constant synthetic tone the fake
// device otherwise produces.
const SPEECH_FIXTURE = path.resolve(projectRoot, 'e2e/fixtures/speech-then-silence.wav')

const BASE_MEDIA_ARGS = [
  // Feed MediaRecorder a synthetic tone instead of a real device.
  '--use-fake-device-for-media-stream',
  // Required as well: without it getUserMedia rejects with NotSupportedError
  // even when permission has been granted.
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
]

/**
 * Browser-level tests for the chat and admin interfaces.
 *
 * The backend is stubbed at the network boundary in every spec, so the suite
 * needs no API key, makes no provider calls and costs nothing to run — the
 * same property the backend's pytest suite has. What is under test here is the
 * interface: what it renders, what it sends, and how it behaves when a request
 * fails.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Grant the microphone up front; individual specs override this when the
    // point of the test is what happens after a denial.
    permissions: ['microphone'],
  },

  projects: [
    {
      name: 'chromium',
      // hands-free-vad.spec.ts needs real speech, not the constant tone this
      // project's launch args produce — it runs under the project below.
      testIgnore: /hands-free-vad\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: BASE_MEDIA_ARGS },
      },
    },
    {
      name: 'chromium-real-audio',
      testMatch: /hands-free-vad\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [...BASE_MEDIA_ARGS, `--use-file-for-fake-audio-capture=${SPEECH_FIXTURE}`],
        },
      },
    },
  ],

  // Reuse a dev server the developer already has open, rather than failing on
  // the pinned strictPort. CI starts its own.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
