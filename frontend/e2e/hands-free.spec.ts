import { expect, test } from '@playwright/test'

import { openChat, stubBackend } from './support'

/**
 * Orchestration, not the voice-activity detector itself — these run under
 * the default project's constant fake tone, since none of them depend on the
 * content of the audio, only on when recording starts and stops. The one
 * test that does depend on real speech content is hands-free-vad.spec.ts,
 * isolated in its own file — see the note there for why.
 */
test.describe('hands-free mode', () => {
  test('starts listening on its own, with no button press', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    await page.getByRole('switch', { name: 'Bisede e vazhdueshme' }).click()

    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible({ timeout: 3000 })
  })

  test('turning it off stops the microphone', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    const toggle = page.getByRole('switch', { name: 'Bisede e vazhdueshme' })
    await toggle.click()
    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible()

    await toggle.click()
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0, { timeout: 2000 })
  })

  test('push-to-talk still works exactly as before', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    // Hands-free is off by default; a manual press still starts and stops a
    // single recording, unaffected by anything hands-free mode added.
    const mic = page.locator('button[aria-pressed]')
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await mic.click()
    await expect(mic).toHaveAttribute('aria-pressed', 'false')
  })

  test('a broken microphone turns hands-free back off instead of retrying forever', async ({
    page,
  }) => {
    await stubBackend(page)
    // Reject at the API, the same way recording.spec.ts simulates a denial —
    // the fake device auto-accepts every permission prompt, so a real denial
    // cannot be produced by withholding permission.
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => {
          const error = new Error('denied for test')
          error.name = 'NotAllowedError'
          return Promise.reject(error)
        },
      })
    })
    await openChat(page)

    const toggle = page.getByRole('switch', { name: 'Bisede e vazhdueshme' })
    await toggle.click()

    await expect(page.getByRole('alert')).toContainText('Nuk u dha leje per mikrofonin')
    await expect(toggle).not.toBeChecked()
  })
})
