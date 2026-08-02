import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, transcribeAudio } from '@/lib/api'
import type { AudioRecording } from '@/hooks/useAudioRecorder'

export interface Transcript {
  text: string
  durationMs: number
  url: string
}

/**
 * Transcribes each new recording as it arrives.
 *
 * Only the newest recording matters: if one is still in flight when the next
 * arrives, the first is aborted so a slow response cannot overwrite a newer
 * question.
 */
export function useTranscription(recording: AudioRecording | null) {
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!recording) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setIsTranscribing(true)
    setError(null)

    transcribeAudio(recording.blob, recording.mimeType, controller.signal)
      .then((result) => {
        setTranscript({
          text: result.text,
          durationMs: recording.durationMs,
          url: recording.url,
        })
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return
        setError(cause instanceof ApiError ? cause.message : 'Transkriptimi deshtoi. Provo serish.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsTranscribing(false)
      })

    return () => controller.abort()
  }, [recording])

  const dismissError = useCallback(() => setError(null), [])

  return { transcript, isTranscribing, error, dismissError }
}
