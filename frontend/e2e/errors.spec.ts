import { expect, test } from '@playwright/test'

import { bubbles, chat, micButton, openChat, settle, stubBackend } from './support'

/** Record without waiting for an answer that is never going to arrive. */
async function record(page: import('@playwright/test').Page): Promise<void> {
  const mic = micButton(page)
  await mic.click()
  await page.waitForTimeout(1500)
  await mic.click()
}

test.describe('backend failures', () => {
  test('shows the message the backend sent when transcription fails', async ({ page }) => {
    const stubs = await stubBackend(page, {
      fail: { route: 'transcribe', status: 422, detail: 'Nuk u dallua asnje e folur ne audio.' },
    })
    await openChat(page)

    await record(page)

    // The backend writes its errors in Albanian already; the frontend shows
    // `detail` as-is rather than mapping it a second time.
    await expect(chat(page).getByText('Nuk u dallua asnje e folur ne audio.')).toBeVisible()

    // A failed transcription must not go on to ask a question.
    await page.waitForTimeout(500)
    expect(stubs.calls.answer).toHaveLength(0)
  })

  test('falls back to an Albanian message when the failure carries none', async ({ page }) => {
    await stubBackend(page, { fail: { route: 'transcribe', status: 500 } })
    await openChat(page)

    await record(page)

    await expect(chat(page).getByText('Diçka shkoi keq. Provo serish.')).toBeVisible()
  })

  test('keeps the question visible when answering fails', async ({ page }) => {
    await stubBackend(page, {
      fail: { route: 'answer', status: 503, detail: 'Sherbimi i pergjigjeve nuk u pergjigj.' },
    })
    await openChat(page)

    await record(page)

    // The transcript succeeded, so it stays on screen with the error beneath
    // it rather than the whole turn disappearing.
    await expect(chat(page).getByText('Sa dite pushimi vjetor kam?')).toBeVisible()
    await expect(chat(page).getByText('Sherbimi i pergjigjeve nuk u pergjigj.')).toBeVisible()
    await expect(bubbles(page)).toHaveCount(1)
  })

  test('reports a speech failure without losing the answer', async ({ page }) => {
    await stubBackend(page, {
      fail: { route: 'speak', status: 503, detail: 'Leximi me ze nuk eshte i disponueshem.' },
    })
    await openChat(page)

    await record(page)
    await expect(bubbles(page)).toHaveCount(2)
    await settle(page)

    // Speech is a secondary channel — the answer is the deliverable.
    await expect(chat(page).getByText('Pushimi vjetor eshte 21 dite pune ne vit.')).toBeVisible()
    await expect(chat(page).getByText('Leximi me ze nuk eshte i disponueshem.')).toBeVisible()
  })

  test('recovers on the next question after a failure', async ({ page }) => {
    await openChat(page)

    // Fail once, then serve normally.
    let first = true
    await page.route('**/transcribe', async (route) => {
      if (first) {
        first = false
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Sherbimi nuk u pergjigj.' }),
        })
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Sa dite pushimi vjetor kam?', model: 'stub' }),
      })
    })
    await page.route('**/answer', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          question: 'Sa dite pushimi vjetor kam?',
          resolved_question: 'Sa dite pushimi vjetor kam?',
          answer: 'Pushimi vjetor eshte 21 dite pune ne vit.',
          answered: true,
          sources: ['Politika e Pushimeve'],
          model: 'stub',
        }),
      }),
    )
    await page.route('**/speak', (route) => route.fulfill({ status: 200, body: '' }))

    await record(page)
    await expect(chat(page).getByText('Sherbimi nuk u pergjigj.')).toBeVisible()

    await record(page)
    await expect(chat(page).getByText('Pushimi vjetor eshte 21 dite pune ne vit.')).toBeVisible()
  })
})
