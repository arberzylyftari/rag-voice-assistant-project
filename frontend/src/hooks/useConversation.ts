import { useCallback, useEffect, useRef, useState } from 'react'

import type { AudioRecording } from '@/hooks/useAudioRecorder'
import { ApiError, answerQuestion, transcribeAudio } from '@/lib/api'
import type { ConversationTurn } from '@/lib/api'

export type ExchangeStatus = 'transcribing' | 'answering' | 'done' | 'failed'

export interface Exchange {
  id: string
  status: ExchangeStatus
  /** Present once transcription succeeds. */
  question?: string
  /** What retrieval actually ran on — differs when a follow-up was rewritten. */
  resolvedQuestion?: string
  answer?: string
  answered?: boolean
  sources?: string[]
  error?: string
  audioUrl: string
  durationMs: number
}

/** Turns sent as history. Only completed exchanges qualify. */
function toHistory(exchanges: Exchange[]): ConversationTurn[] {
  return exchanges
    .filter((exchange) => exchange.status === 'done' && exchange.question && exchange.answer)
    .flatMap((exchange) => [
      { role: 'user' as const, content: exchange.question! },
      { role: 'assistant' as const, content: exchange.answer! },
    ])
}

function describe(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message
  return fallback
}

/**
 * Drives a recording through transcription and answering, keeping the
 * conversation so far.
 *
 * History is read at the moment a request is sent rather than from a captured
 * closure, so an exchange started while an earlier one is still in flight
 * still sees everything that has completed.
 */
export function useConversation(recording: AudioRecording | null) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const exchangesRef = useRef<Exchange[]>([])
  const controllerRef = useRef<AbortController | null>(null)

  exchangesRef.current = exchanges

  const update = useCallback((id: string, patch: Partial<Exchange>) => {
    setExchanges((current) =>
      current.map((exchange) => (exchange.id === id ? { ...exchange, ...patch } : exchange)),
    )
  }, [])

  useEffect(() => {
    if (!recording) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    const id = crypto.randomUUID()

    setExchanges((current) => [
      ...current,
      {
        id,
        status: 'transcribing',
        audioUrl: recording.url,
        durationMs: recording.durationMs,
      },
    ])

    void (async () => {
      let question: string

      try {
        const transcription = await transcribeAudio(
          recording.blob,
          recording.mimeType,
          controller.signal,
        )
        question = transcription.text
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'AbortError') return
        update(id, {
          status: 'failed',
          error: describe(cause, 'Transkriptimi deshtoi. Provo serish.'),
        })
        return
      }

      update(id, { status: 'answering', question })

      try {
        const history = toHistory(exchangesRef.current)
        const result = await answerQuestion(question, history, controller.signal)

        update(id, {
          status: 'done',
          answer: result.answer,
          answered: result.answered,
          sources: result.sources,
          resolvedQuestion:
            result.resolved_question === question ? undefined : result.resolved_question,
        })
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'AbortError') return
        update(id, {
          status: 'failed',
          error: describe(cause, 'Gjenerimi i pergjigjes deshtoi. Provo serish.'),
        })
      }
    })()

    return () => controller.abort()
  }, [recording, update])

  const isBusy = exchanges.some(
    (exchange) => exchange.status === 'transcribing' || exchange.status === 'answering',
  )

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    setExchanges([])
  }, [])

  return { exchanges, isBusy, reset }
}
