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

/** Call the backend health endpoint. Throws if the backend is unreachable. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, { signal })

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  return (await response.json()) as HealthResponse
}
