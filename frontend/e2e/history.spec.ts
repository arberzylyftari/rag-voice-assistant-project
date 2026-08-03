import { expect, test } from '@playwright/test'

import {
  ask,
  bubbles,
  chat,
  conversationRows,
  openChat,
  readConversations,
  seedConversations,
  stubBackend,
} from './support'

/** A saved conversation, written straight to storage. */
function saved(overrides: Partial<{ id: string; title: string; updatedAt: number }> = {}) {
  return {
    id: 'seed-1',
    title: 'Sa dite pushimi vjetor kam?',
    updatedAt: Date.now(),
    turns: [
      {
        id: 't1',
        question: 'Sa dite pushimi vjetor kam?',
        answer: 'Njezet e nje dite pune ne vit.',
        answered: true,
        sources: ['Politika e Pushimeve'],
        durationMs: 1600,
      },
      {
        id: 't2',
        question: 'Po pas pese vjetesh?',
        answer: 'Njezet e kater dite pune.',
        answered: true,
        sources: ['Politika e Pushimeve'],
        resolvedQuestion: 'Sa dite pushimi pas pese vjetesh?',
        durationMs: 1600,
      },
    ],
    ...overrides,
  }
}

test.describe('saved conversations', () => {
  test('shows an empty state before anything is saved', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    await expect(page.getByText('Bisedat e ruajtura shfaqen ketu.')).toBeVisible()
    await expect(conversationRows(page)).toHaveCount(0)
  })

  test('saves the turns of one conversation under a title from the first question', async ({
    page,
  }) => {
    await stubBackend(page, {
      transcripts: ['Sa dite pushimi vjetor kam?', 'Po pas pese vjetesh?'],
    })
    await openChat(page)

    await ask(page)
    await ask(page)

    await expect(conversationRows(page)).toHaveCount(1)
    await expect(conversationRows(page)).toHaveText(['Sa dite pushimi vjetor kam?'])

    const stored = await readConversations(page)
    expect(stored).toHaveLength(1)
    expect(stored[0].turns).toHaveLength(2)
  })

  test('never writes audio to storage', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    await ask(page)

    // Recordings are object URLs that die on reload; persisting the audio
    // itself was rejected deliberately.
    const raw = await page.evaluate(() => localStorage.getItem('conversations') ?? '')
    expect(raw).not.toContain('blob:')
    expect(raw).not.toContain('base64')
  })

  test('only saves completed turns', async ({ page }) => {
    await stubBackend(page, { fail: { route: 'answer', status: 503, detail: 'Sherbimi nuk u pergjigj.' } })
    await openChat(page)

    const mic = page.locator('button[aria-pressed]')
    await mic.click()
    await page.waitForTimeout(1500)
    await mic.click()

    await expect(page.getByText('Sherbimi nuk u pergjigj.')).toBeVisible()

    // A failed exchange has nothing worth reopening.
    expect(await readConversations(page)).toHaveLength(0)
    await expect(conversationRows(page)).toHaveCount(0)
  })

  test('lists conversations newest first and survives a reload', async ({ page }) => {
    await stubBackend(page, { transcripts: ['Pyetja e pare?', 'Pyetja e dyte?'] })
    await openChat(page)

    await ask(page)
    await page.getByRole('button', { name: 'Bisede e re' }).click()
    await ask(page)

    await expect(conversationRows(page)).toHaveText(['Pyetja e dyte?', 'Pyetja e pare?'])

    await page.reload()

    await expect(conversationRows(page)).toHaveText(['Pyetja e dyte?', 'Pyetja e pare?'])
    // A reload starts a fresh conversation rather than resuming the last one.
    await expect(page.getByText('Ende nuk ka biseda')).toBeVisible()
  })

  test('reopens a conversation with its answers and sources', async ({ page }) => {
    await stubBackend(page)
    await page.goto('/')
    await seedConversations(page, [saved()])
    await page.reload()

    await conversationRows(page).first().click()

    await expect(bubbles(page)).toHaveCount(4)
    await expect(chat(page).getByText('Sa dite pushimi vjetor kam?')).toBeVisible()
    await expect(chat(page).getByText('Njezet e nje dite pune ne vit.')).toBeVisible()
    // The rewritten form is part of the record, not just of the live turn.
    await expect(chat(page).getByText('Sa dite pushimi pas pese vjetesh?')).toBeVisible()
  })

  test('a reopened conversation has no audio player and does not speak by itself', async ({
    page,
  }) => {
    const stubs = await stubBackend(page)
    await page.goto('/')
    await seedConversations(page, [saved()])
    await page.reload()

    await conversationRows(page).first().click()
    await expect(bubbles(page)).toHaveCount(4)

    // Object URLs do not survive a reload, so there is nothing to play.
    await expect(page.locator('audio')).toHaveCount(0)

    // Autoplay is for an answer that has just arrived, not one being reviewed.
    await page.waitForTimeout(2000)
    expect(stubs.calls.speak).toHaveLength(0)

    // The control is still there — /speak re-synthesises on demand.
    await expect(page.getByRole('button', { name: 'Lexo me ze' }).first()).toBeVisible()
  })

  test('a genuinely new answer still speaks, in a reopened conversation', async ({ page }) => {
    const stubs = await stubBackend(page, { transcripts: ['Nje pyetje e re?'] })
    await page.goto('/')
    await seedConversations(page, [saved()])
    await page.reload()

    await conversationRows(page).first().click()
    await expect(bubbles(page)).toHaveCount(4)
    expect(stubs.calls.speak).toHaveLength(0)

    await ask(page)

    await expect.poll(() => stubs.calls.speak.length).toBe(1)
  })

  test('continues a reopened conversation instead of starting a new one', async ({ page }) => {
    await stubBackend(page, { transcripts: ['Nje pyetje e trete?'] })
    await page.goto('/')
    await seedConversations(page, [saved()])
    await page.reload()

    await conversationRows(page).first().click()
    await expect(bubbles(page)).toHaveCount(4)

    await ask(page)

    const stored = await readConversations(page)
    expect(stored).toHaveLength(1)
    expect(stored[0].turns).toHaveLength(3)
    await expect(conversationRows(page)).toHaveCount(1)
  })

  test('deletes a conversation behind a confirmation', async ({ page }) => {
    await stubBackend(page)
    await page.goto('/')
    await seedConversations(page, [
      saved({ id: 'a', title: 'E para?', updatedAt: Date.now() }),
      saved({ id: 'b', title: 'E dyta?', updatedAt: Date.now() - 60_000 }),
    ])
    await page.reload()

    await expect(conversationRows(page)).toHaveCount(2)

    await page.locator('[data-sidebar="menu-item"]').first().hover()
    await page.locator('[data-sidebar="menu-action"]').first().click()

    await expect(page.getByText('Te fshihet biseda?')).toBeVisible()

    // Cancelling keeps it.
    await page.getByRole('button', { name: 'Anulo' }).click()
    await expect(conversationRows(page)).toHaveCount(2)

    await page.locator('[data-sidebar="menu-item"]').first().hover()
    await page.locator('[data-sidebar="menu-action"]').first().click()
    await page.getByRole('button', { name: 'Fshij' }).click()

    await expect(conversationRows(page)).toHaveText(['E dyta?'])
    expect(await readConversations(page)).toHaveLength(1)
  })

  test('groups conversations by recency', async ({ page }) => {
    await stubBackend(page)
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    await page.goto('/')
    await seedConversations(page, [
      saved({ id: 'a', title: 'Sot?', updatedAt: startOfToday + 3_600_000 }),
      saved({ id: 'b', title: 'Dje?', updatedAt: startOfToday - 3_600_000 }),
      saved({ id: 'c', title: 'Javen e kaluar?', updatedAt: startOfToday - 4 * 86_400_000 }),
      saved({ id: 'd', title: 'Shume kohe me pare?', updatedAt: startOfToday - 40 * 86_400_000 }),
    ])
    await page.reload()

    await expect(page.getByText('Sot', { exact: true })).toBeVisible()
    await expect(page.getByText('Dje', { exact: true })).toBeVisible()
    await expect(page.getByText('7 ditet e fundit', { exact: true })).toBeVisible()
    await expect(page.getByText('Me pare', { exact: true })).toBeVisible()
  })

  test('discards a stored shape it cannot read, without breaking the page', async ({ page }) => {
    await stubBackend(page)
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('conversations', '{"not":"an array"}'))
    await page.reload()

    // Losing the history is acceptable; failing to open the page is not.
    await expect(page.getByText('Ende nuk ka biseda')).toBeVisible()
    await expect(page.getByText('Bisedat e ruajtura shfaqen ketu.')).toBeVisible()
  })
})
