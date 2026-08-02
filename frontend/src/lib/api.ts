/**
 * Thin client for the backend API.
 *
 * The base URL is configurable so the same build can point at a local
 * backend during development and at the deployed one in production.
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface HealthResponse {
  status: string
  service: string
  version: string
  environment: string
}

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

/** Call the backend health endpoint. Throws if the backend is unreachable. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, { signal })

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  return (await response.json()) as HealthResponse
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
