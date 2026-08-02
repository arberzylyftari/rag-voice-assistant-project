import { expect, test } from '@playwright/test'

import { ask, bubbles, chat, openChat, paragraph, stubBackend } from './support'

test.describe('the conversation loop', () => {
  test('records a question, shows the answer and its sources', async ({ page }) => {
    const stubs = await stubBackend(page)
    await openChat(page)

    await ask(page)

    await expect(chat(page).getByText('Sa dite pushimi vjetor kam?')).toBeVisible()
    await expect(chat(page).getByText('Pushimi vjetor eshte 21 dite pune ne vit.')).toBeVisible()

    // Sources are collapsed until asked for — an answer should read as an
    // answer, not as a citation list.
    await expect(chat(page).getByText('Politika e Pushimeve')).toBeHidden()
    await page.getByRole('button', { name: '1 burim' }).click()
    await expect(chat(page).getByText('Politika e Pushimeve')).toBeVisible()

    expect(stubs.calls.answer).toHaveLength(1)
    expect(stubs.calls.answer[0].question).toBe('Sa dite pushimi vjetor kam?')
  })

  test('the question keeps its recording playable', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    await ask(page)

    const audio = page.locator('audio')
    await expect(audio).toHaveCount(1)
    await expect(audio).toHaveJSProperty('paused', true)
    expect(await audio.getAttribute('src')).toMatch(/^blob:/)
  })

  test('sends the completed turns as history on a follow-up', async ({ page }) => {
    const stubs = await stubBackend(page, {
      transcripts: ['Sa dite pushimi vjetor kam?', 'Po pas pese vjetesh?'],
    })
    await openChat(page)

    await ask(page)
    await ask(page)

    expect(stubs.calls.answer).toHaveLength(2)

    // The first question carries no history; the second carries the first
    // exchange, which is what lets the backend resolve it.
    expect(stubs.calls.answer[0].history ?? []).toHaveLength(0)
    expect(stubs.calls.answer[1].history).toHaveLength(2)
    expect(stubs.calls.answer[1].history?.[0]).toEqual({
      role: 'user',
      content: 'Sa dite pushimi vjetor kam?',
    })
    expect(stubs.calls.answer[1].history?.[1].role).toBe('assistant')
  })

  test('shows what a rewritten follow-up was understood as', async ({ page }) => {
    await stubBackend(page, {
      transcripts: ['Po pas pese vjetesh?'],
      answer: {
        resolved_question: 'Sa dite pushimi vjetor kam pas pese vjetesh pune?',
        answer: 'Pas pese vjetesh, pushimi vjetor eshte 24 dite pune.',
      },
    })
    await openChat(page)

    await ask(page)

    // Traceability: an answer about five years' service has to be traceable
    // to the question retrieval actually ran on.
    await expect(chat(page).getByText('U kuptua si:')).toBeVisible()
    await expect(
      chat(page).getByText('Sa dite pushimi vjetor kam pas pese vjetesh pune?'),
    ).toBeVisible()
  })

  test('does not show the resolved question when nothing was rewritten', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    await ask(page)

    await expect(chat(page).getByText('U kuptua si:')).toBeHidden()
  })

  test('styles a refusal apart from an answer, with no sources', async ({ page }) => {
    await stubBackend(page, {
      transcripts: ['A lejohen kafshet shtepiake ne zyre?'],
      answer: {
        answered: false,
        answer: 'Nuk kam informacion per kete pyetje ne dokumentet e brendshme.',
        sources: [],
      },
    })
    await openChat(page)

    await ask(page)

    const refusal = paragraph(page, 'Nuk kam informacion per kete pyetje')
    await expect(refusal).toBeVisible()
    // "We do not cover this" should not read like a finding.
    await expect(refusal).toHaveClass(/italic/)
    await expect(page.getByRole('button', { name: /burim/ })).toBeHidden()
  })

  test('speaks the newest answer and offers replay', async ({ page }) => {
    const stubs = await stubBackend(page)
    await openChat(page)

    await ask(page)

    await expect.poll(() => stubs.calls.speak.length).toBe(1)
    expect(stubs.calls.speak[0].text).toBe('Pushimi vjetor eshte 21 dite pune ne vit.')
    await expect(page.getByRole('button', { name: /Lexo me ze|Ndalo leximin/ })).toBeVisible()
  })

  test('starts a new conversation from the sidebar', async ({ page }) => {
    await stubBackend(page)
    await openChat(page)

    await ask(page)
    await expect(bubbles(page)).toHaveCount(2)

    await page.getByRole('button', { name: 'Bisede e re' }).click()

    await expect(page.getByText('Ende nuk ka biseda')).toBeVisible()
    await expect(bubbles(page)).toHaveCount(0)
  })
})
