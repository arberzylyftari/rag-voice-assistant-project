import { defineConfig, devices } from '@playwright/test'

const PORT = 5180
const BASE_URL = `http://localhost:${PORT}`

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
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Feed MediaRecorder a synthetic tone instead of a real device.
            '--use-fake-device-for-media-stream',
            // Required as well: without it getUserMedia rejects with
            // NotSupportedError even when permission has been granted.
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
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
