/**
 * Saved conversations, kept in `localStorage`.
 *
 * The API stays stateless — history is still sent by the client on every
 * `/answer` call — so this is purely a client-side record of what was asked.
 * Keeping it here rather than in a table also means a publicly deployed demo
 * does not show one visitor the conversations of another.
 *
 * Only the text is stored. Recordings live in object URLs that do not survive
 * a reload, so a reopened conversation shows the transcript without a player;
 * the answer can still be spoken, because `/speak` synthesises it on demand.
 */

export const CONVERSATIONS_STORAGE_KEY = 'conversations'

/** Oldest conversations past this are dropped, so storage cannot grow without bound. */
const MAX_CONVERSATIONS = 50

/** Longer titles are cut at a word boundary near this length. */
const MAX_TITLE_LENGTH = 60

/** A completed exchange, reduced to what is worth keeping. */
export interface StoredTurn {
  id: string
  question: string
  answer: string
  answered: boolean
  sources: string[]
  resolvedQuestion?: string
  durationMs: number
}

export interface StoredConversation {
  id: string
  title: string
  /** Epoch milliseconds, used for ordering and for the sidebar's date groups. */
  updatedAt: number
  turns: StoredTurn[]
}

/**
 * Name a conversation after the question that opened it.
 *
 * Albanian questions are already self-describing — "Sa dite pushimi vjetor
 * kam?" needs no summarising — so this costs nothing and stays stable, where a
 * generated title would need a round trip and a title-less state until it lands.
 */
export function deriveTitle(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, ' ')
  if (!cleaned) return 'Bisede pa titull'
  if (cleaned.length <= MAX_TITLE_LENGTH) return cleaned

  const cut = cleaned.slice(0, MAX_TITLE_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')

  return `${lastSpace > MAX_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut}…`
}

function isStoredTurn(value: unknown): value is StoredTurn {
  if (!value || typeof value !== 'object') return false
  const turn = value as Record<string, unknown>

  return (
    typeof turn.id === 'string' &&
    typeof turn.question === 'string' &&
    typeof turn.answer === 'string' &&
    Array.isArray(turn.sources)
  )
}

function isStoredConversation(value: unknown): value is StoredConversation {
  if (!value || typeof value !== 'object') return false
  const conversation = value as Record<string, unknown>

  return (
    typeof conversation.id === 'string' &&
    typeof conversation.title === 'string' &&
    typeof conversation.updatedAt === 'number' &&
    Array.isArray(conversation.turns) &&
    conversation.turns.every(isStoredTurn)
  )
}

/**
 * Every saved conversation, newest first.
 *
 * Anything unreadable is discarded rather than thrown: a stored shape from an
 * older build should cost the user their history, not the ability to open the
 * page at all.
 */
export function loadConversations(): StoredConversation[] {
  let raw: string | null

  try {
    raw = localStorage.getItem(CONVERSATIONS_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in private modes.
    return []
  }

  if (!raw) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(isStoredConversation)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function write(conversations: StoredConversation[]): void {
  try {
    localStorage.setItem(
      CONVERSATIONS_STORAGE_KEY,
      JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)),
    )
  } catch {
    // A full or unavailable quota must not break the conversation in progress.
  }
}

/** Insert or replace a conversation and return the list as it now stands. */
export function saveConversation(conversation: StoredConversation): StoredConversation[] {
  const others = loadConversations().filter((entry) => entry.id !== conversation.id)
  const updated = [conversation, ...others].sort((a, b) => b.updatedAt - a.updatedAt)

  write(updated)
  return updated.slice(0, MAX_CONVERSATIONS)
}

export function deleteConversation(id: string): StoredConversation[] {
  const remaining = loadConversations().filter((conversation) => conversation.id !== id)

  write(remaining)
  return remaining
}

export function findConversation(id: string): StoredConversation | undefined {
  return loadConversations().find((conversation) => conversation.id === id)
}
