import { expect, test, type Page } from '@playwright/test'

import { micButton, openChat, stubBackend } from './support'

/**
 * Make `getUserMedia` reject, to reach the error mapping.
 *
 * The browser is launched with `--use-fake-ui-for-media-stream`, which
 * auto-accepts every permission prompt — so a denial cannot be produced by
 * withholding the permission. Rejecting at the API is what the recorder
 * actually reacts to, and the mapping from `error.name` to an Albanian
 * message is what is under test.
 */
async function rejectMicrophone(page: Page, name: string): Promise<void> {
  await page.addInitScript((errorName) => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => {
        const error = new Error('denied for test')
        error.name = errorName
        return Promise.reject(error)
      },
    })
  }, name)
}

test.describe('the recorder', () => {
  test('reports a denied microphone in Albanian', async ({ page }) => {
    await stubBackend(page)
    await rejectMicrophone(page, 'NotAllowedError')
    await openChat(page)

    await micButton(page).click()

    await expect(page.getByRole('alert')).toContainText('Nuk u dha leje per mikrofonin')
    // Nothing was recorded, so nothing should have been sent.
    await expect(page.locator('[data-slot="card"] [data-slot="card"]')).toHaveCount(0)
  })

  test('distinguishes a missing microphone from a denied one', async ({ page }) => {
    await stubBackend(page)
    await rejectMicrophone(page, 'NotFoundError')
    await openChat(page)

    await micButton(page).click()

    await expect(page.getByRole('alert')).toContainText('Nuk u gjet asnje mikrofon')
  })

  test('reports a microphone already in use', async ({ page }) => {
    await stubBackend(page)
    await rejectMicrophone(page, 'NotReadableError')
    await openChat(page)

    await micButton(page).click()

    await expect(page.getByRole('alert')).toContainText('po perdoret nga nje aplikacion tjeter')
  })

  test('discards a recording too short to contain speech', async ({ page }) => {
    const stubs = await stubBackend(page)
    await openChat(page)

    const mic = micButton(page)
    await mic.click()
    await page.waitForTimeout(200) // under the 700 ms floor
    await mic.click()

    await expect(page.getByRole('alert')).toContainText('Nuk u regjistrua asnje ze')

    // The point of the gate is that silence never reaches the API: the
    // transcription model answers silence with an invented question.
    await page.waitForTimeout(1000)
    expect(stubs.calls.transcribe).toHaveLength(0)
  })

  test('shows a timer while recording and releases the microphone on stop', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    const mic = micButton(page)
    await mic.click()

    await expect(mic).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('timer')).toBeVisible()

    await page.waitForTimeout(1200)
    await mic.click()

    await expect(mic).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('timer')).toBeHidden()
  })

  test('dismisses a notice when asked', async ({ page }) => {
    await stubBackend(page)
    await rejectMicrophone(page, 'NotAllowedError')
    await openChat(page)

    await micButton(page).click()
    await expect(page.getByRole('alert')).toBeVisible()

    await page.getByRole('button', { name: 'Mbyll njoftimin' }).click()

    await expect(page.getByRole('alert')).toBeHidden()
  })
})
