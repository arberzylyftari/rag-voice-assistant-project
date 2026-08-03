import { expect, test } from '@playwright/test'

import { openChat, settle, stubBackend } from './support'

/**
 * Runs under the `chromium-real-audio` project (see playwright.config.ts),
 * which feeds the microphone real Albanian speech followed by real silence
 * instead of the constant synthetic tone the other specs use. That is what
 * lets this test exercise the actual voice-activity detector rather than a
 * stand-in for it — the pause that ends a turn is a real pause in real
 * audio, not a value this test controls.
 *
 * Deliberately the only test in this file. Chrome's fake-audio-capture
 * appears to advance through the fixture file at wall-clock speed for as
 * long as the browser process lives, not reset per recording — a second
 * test in the same worker inherited a playback position already deep into
 * the trailing silence and never observed the speech portion at all. One
 * test per file keeps this test the first and only thing that ever touches
 * that browser's fake microphone.
 */
test('stops on its own once real speech pauses, then resumes listening', async ({ page }) => {
  const stubs = await stubBackend(page)
  await openChat(page)

  await page.getByRole('switch', { name: 'Bisede e vazhdueshme' }).click()
  await expect(page.locator('button[aria-pressed="true"]')).toBeVisible()

  // The fixture is ~3.4s of real speech followed by a real pause. Nothing in
  // this test tells the recorder when to stop — the voice-activity detector
  // has to notice the pause on its own. Polling the transcribe-call count
  // rather than the button's pressed state: with the backend stubbed to
  // respond instantly, the loop can complete more than one full cycle within
  // a single wait, so watching for "not pressed" risks catching the tail of
  // a later cycle instead of confirming the first one actually happened.
  await expect
    .poll(() => stubs.calls.transcribe.length, { timeout: 20_000, intervals: [200] })
    .toBeGreaterThanOrEqual(1)

  await settle(page)

  // The answer and its speech are both stubbed to resolve immediately, so
  // once the turn is handled, listening should resume without any further
  // input from this test.
  await expect(page.locator('button[aria-pressed="true"]')).toBeVisible({ timeout: 5000 })
})
