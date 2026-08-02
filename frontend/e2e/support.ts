import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Shared helpers for the browser tests.
 *
 * Every backend call is stubbed here. Fake media produces a tone rather than
 * Albanian speech, so a real transcription could never return a usable
 * question; stubbing it is what makes the interface testable at all. The
 * stubs also keep the suite free to run and independent of a running backend.
 */

export interface StubOptions {
  /** Questions handed back by `/transcribe`, in order. The last one repeats. */
  transcripts?: string[]
  answer?: Partial<AnswerBody>
  /** Fail a route instead of fulfilling it, to exercise the error paths. */
  fail?: { route: 'transcribe' | 'answer' | 'speak'; status: number; detail?: string }
}

interface AnswerBody {
  question: string
  resolved_question: string
  answer: string
  answered: boolean
  sources: string[]
  model: string
}

export const DEFAULT_TRANSCRIPT = 'Sa dite pushimi vjetor kam?'

const DEFAULT_ANSWER: AnswerBody = {
  question: DEFAULT_TRANSCRIPT,
  resolved_question: DEFAULT_TRANSCRIPT,
  answer: 'Pushimi vjetor eshte 21 dite pune ne vit.',
  answered: true,
  sources: ['Politika e Pushimeve dhe e Lejeve > 1. Pushimi vjetor'],
  model: 'stub',
}

/** A one-frame silent MP3, so an <audio> element has something real to load. */
const TINY_MP3 = Buffer.from(
  '//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA' +
    'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP///////////' +
    '////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAA' +
    'AAAAAnGx9j0zAAAAAAAAAAAAAAAAAAAA',
  'base64',
)

export interface Stubs {
  /** Requests seen by each route, newest last. */
  calls: { transcribe: unknown[]; answer: AnswerRequest[]; speak: { text: string }[] }
}

export interface AnswerRequest {
  question: string
  history?: { role: string; content: string }[]
}

/** Install stubs for every backend route the chat page uses. */
export async function stubBackend(page: Page, options: StubOptions = {}): Promise<Stubs> {
  const transcripts = options.transcripts ?? [DEFAULT_TRANSCRIPT]
  const calls: Stubs['calls'] = { transcribe: [], answer: [], speak: [] }
  let asked = 0

  const failing = options.fail

  await page.route('**/transcribe', async (route) => {
    calls.transcribe.push(null)

    if (failing?.route === 'transcribe') {
      return route.fulfill({
        status: failing.status,
        contentType: 'application/json',
        body: JSON.stringify({ detail: failing.detail }),
      })
    }

    const text = transcripts[Math.min(asked++, transcripts.length - 1)]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text, model: 'stub' }),
    })
  })

  await page.route('**/answer', async (route) => {
    const body = route.request().postDataJSON() as AnswerRequest
    calls.answer.push(body)

    if (failing?.route === 'answer') {
      return route.fulfill({
        status: failing.status,
        contentType: 'application/json',
        body: JSON.stringify({ detail: failing.detail }),
      })
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...DEFAULT_ANSWER,
        question: body.question,
        resolved_question: body.question,
        ...options.answer,
      }),
    })
  })

  await page.route('**/speak', async (route) => {
    calls.speak.push(route.request().postDataJSON() as { text: string })

    if (failing?.route === 'speak') {
      return route.fulfill({
        status: failing.status,
        contentType: 'application/json',
        body: JSON.stringify({ detail: failing.detail }),
      })
    }

    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: TINY_MP3 })
  })

  return { calls }
}

/** The push-to-talk button. Its accessible name changes with state, so key off the role. */
export function micButton(page: Page): Locator {
  return page.locator('button[aria-pressed]')
}

/**
 * The chat region.
 *
 * Scope text assertions to this: a saved conversation's title repeats its
 * opening question in the sidebar, so an unscoped `getByText` for a question
 * matches twice.
 */
export function chat(page: Page): Locator {
  return page.getByRole('main')
}

/** The conversation bubbles, excluding the panel card that wraps them. */
export function bubbles(page: Page): Locator {
  return page.locator('[data-slot="card"] [data-slot="card"]')
}

/**
 * A paragraph of the conversation, by its text.
 *
 * Answers are rendered through `TypingText`, which puts the text in a nested
 * span — so a text locator resolves to the span, not to the paragraph
 * carrying the styling.
 */
export function paragraph(page: Page, text: string): Locator {
  return chat(page).locator('p').filter({ hasText: text })
}

/**
 * Record a question and wait for its answer to finish arriving.
 *
 * `durationMs` must clear the recorder's 700 ms floor, or the recording is
 * discarded as silence before it is ever uploaded.
 */
export async function ask(page: Page, durationMs = 1500): Promise<void> {
  const before = await bubbles(page).count()
  const mic = micButton(page)

  await mic.click()
  await page.waitForTimeout(durationMs)
  await mic.click()

  // Two new bubbles: the question and the answer.
  await expect(bubbles(page)).toHaveCount(before + 2, { timeout: 30_000 })
  await settle(page)
}

/**
 * Wait for the typing animation to stop changing the text.
 *
 * Answers are revealed character by character, so an assertion made the
 * moment a bubble appears reads a partial string. This polls until the text
 * stops growing rather than sleeping for a guessed duration.
 */
export async function settle(page: Page): Promise<void> {
  const target = bubbles(page).last()
  let previous = ''

  await expect
    .poll(async () => {
      const current = await target.innerText()
      const stable = current === previous && current.length > 0
      previous = current
      return stable
    }, { timeout: 15_000, intervals: [150] })
    .toBe(true)
}

/** Write conversations straight into storage, for tests that do not need to record. */
export async function seedConversations(page: Page, conversations: unknown[]): Promise<void> {
  await page.evaluate(
    (value) => localStorage.setItem('conversations', JSON.stringify(value)),
    conversations,
  )
}

export async function readConversations(page: Page): Promise<
  { id: string; title: string; updatedAt: number; turns: unknown[] }[]
> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('conversations') ?? '[]'))
}

/** Open the chat page with empty storage, so tests do not inherit each other's state. */
export async function openChat(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByText('Ende nuk ka biseda')).toBeVisible()
}

export function conversationRows(page: Page): Locator {
  return page.locator('[data-sidebar="menu-button"]')
}
