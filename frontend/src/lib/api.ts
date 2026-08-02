/**
 * Thin client for the backend API.
 *
 * The base URL is configurable so the same build can point at a local
 * backend during development and at the deployed one in production.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface TranscriptionResponse {
  text: string
  model: string
}

/** Fallback for failures that carry no message from the backend. */
const GENERIC_ERROR = 'Diçka shkoi keq. Provo serish.'

/**
 * An API failure carrying a message meant for the user.
 *
 * The backend writes its error text in Albanian already, so `message` is
 * displayed as-is rather than being mapped again on this side.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Pull the Albanian message out of a FastAPI error body. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()

    if (body && typeof body === 'object' && 'detail' in body) {
      const { detail } = body as { detail: unknown }
      // Request-validation failures return a list of issues rather than a
      // string; those are developer errors, not something to show the user.
      if (typeof detail === 'string') return detail
    }
  } catch {
    // Not JSON — fall through to the generic message.
  }

  return GENERIC_ERROR
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AnswerResponse {
  question: string
  resolved_question: string
  answer: string
  answered: boolean
  sources: string[]
  model: string
}

/**
 * Ask a question, optionally against earlier turns.
 *
 * History lets the backend resolve a follow-up into a standalone question; it
 * is never used as a source of facts.
 */
export async function answerQuestion(
  question: string,
  history: ConversationTurn[],
  signal?: AbortSignal,
): Promise<AnswerResponse> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError(
      'Nuk u arrit lidhja me serverin. Kontrollo internetin dhe provo serish.',
      0,
    )
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  return (await response.json()) as AnswerResponse
}

export interface KnowledgeDocument {
  id: number
  filename: string
  title: string
  version: string | null
  owner: string | null
  chunk_count: number
  indexed: boolean
  updated_at: string
}

/** Admin requests carry a shared secret rather than a session. */
function adminHeaders(token: string): HeadersInit {
  return { 'X-Admin-Token': token }
}

export async function listDocuments(
  token: string,
  signal?: AbortSignal,
): Promise<KnowledgeDocument[]> {
  const response = await fetch(`${API_BASE_URL}/admin/documents`, {
    headers: adminHeaders(token),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  return (await response.json()) as KnowledgeDocument[]
}

export async function uploadDocument(
  token: string,
  file: File,
  signal?: AbortSignal,
): Promise<KnowledgeDocument> {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${API_BASE_URL}/admin/documents`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: form,
    signal,
  })

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  const body = (await response.json()) as { document: KnowledgeDocument }
  return body.document
}

export async function deleteDocument(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/admin/documents/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }
}

/** Render Albanian text as speech. Returns MP3 audio. */
export async function speakText(text: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('Nuk u arrit lidhja me serverin.', 0)
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  return await response.blob()
}

/** Send a recording for transcription. Throws `ApiError` on failure. */
export async function transcribeAudio(
  blob: Blob,
  mimeType: string,
  signal?: AbortSignal,
): Promise<TranscriptionResponse> {
  const form = new FormData()
  // The backend reads the container from the part's content type, so the
  // blob is wrapped in a File carrying the recorder's own mime type.
  form.append('audio', new File([blob], 'question', { type: mimeType }))

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/transcribe`, {
      method: 'POST',
      body: form,
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError(
      'Nuk u arrit lidhja me serverin. Kontrollo internetin dhe provo serish.',
      0,
    )
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  return (await response.json()) as TranscriptionResponse
}
