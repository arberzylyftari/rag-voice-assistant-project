import { useCallback, useEffect, useRef, useState } from 'react'

import type { AudioRecording } from '@/hooks/useAudioRecorder'
import { ApiError, answerQuestion, transcribeAudio } from '@/lib/api'
import type { ConversationTurn } from '@/lib/api'
import {
  deleteConversation,
  deriveTitle,
  findConversation,
  loadConversations,
  saveConversation,
} from '@/lib/conversations'
import type { StoredConversation, StoredTurn } from '@/lib/conversations'

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
  /** Absent on reopened turns: object URLs do not survive a reload. */
  audioUrl?: string
  durationMs: number
  /** Read back from storage rather than answered just now. */
  restored?: boolean
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

/** The completed exchanges, reduced to what is worth saving. */
function toStoredTurns(exchanges: Exchange[]): StoredTurn[] {
  return exchanges
    .filter((exchange) => exchange.status === 'done' && exchange.question && exchange.answer)
    .map((exchange) => ({
      id: exchange.id,
      question: exchange.question!,
      answer: exchange.answer!,
      answered: exchange.answered ?? false,
      sources: exchange.sources ?? [],
      resolvedQuestion: exchange.resolvedQuestion,
      durationMs: exchange.durationMs,
    }))
}

function toExchange(turn: StoredTurn): Exchange {
  return {
    id: turn.id,
    status: 'done',
    question: turn.question,
    answer: turn.answer,
    answered: turn.answered,
    sources: turn.sources,
    resolvedQuestion: turn.resolvedQuestion,
    durationMs: turn.durationMs,
    restored: true,
  }
}

function describe(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message
  return fallback
}

/**
 * Drives a recording through transcription and answering, keeping the
 * conversation so far and the saved conversations beside it.
 *
 * History is read at the moment a request is sent rather than from a captured
 * closure, so an exchange started while an earlier one is still in flight
 * still sees everything that has completed.
 *
 * Saving happens here rather than in the page because this is what knows when
 * an exchange finishes. Only completed exchanges are written: a failed or
 * in-flight one has nothing worth reopening.
 */
export function useConversation(recording: AudioRecording | null) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [conversations, setConversations] = useState<StoredConversation[]>(loadConversations)
  // Annotated, because `randomUUID` returns a narrow template literal type
  // that a stored id would not satisfy.
  const [activeId, setActiveId] = useState<string>(() => crypto.randomUUID())

  const exchangesRef = useRef<Exchange[]>([])
  const controllerRef = useRef<AbortController | null>(null)
  // What was last written, so restoring a conversation does not immediately
  // rewrite it and push it back to the top of the list.
  const savedRef = useRef('')

  exchangesRef.current = exchanges

  const update = useCallback((id: string, patch: Partial<Exchange>) => {
    setExchanges((current) =>
      current.map((exchange) => (exchange.id === id ? { ...exchange, ...patch } : exchange)),
    )
  }, [])

  /**
   * Free the recordings of the conversation being left.
   *
   * The recorder creates these URLs but no longer owns them — the conversation
   * decides how long they are needed, which is until it is closed.
   */
  const releaseAudio = useCallback(() => {
    for (const exchange of exchangesRef.current) {
      if (exchange.audioUrl) URL.revokeObjectURL(exchange.audioUrl)
    }
  }, [])

  useEffect(() => {
    return () => releaseAudio()
  }, [releaseAudio])

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

  // Save whenever the completed turns change. The fingerprint keeps the
  // in-flight statuses of an exchange from counting as a change of its own.
  useEffect(() => {
    const turns = toStoredTurns(exchanges)
    if (turns.length === 0) return

    const fingerprint = JSON.stringify(turns)
    if (fingerprint === savedRef.current) return
    savedRef.current = fingerprint

    setConversations(
      saveConversation({
        id: activeId,
        title: deriveTitle(turns[0].question),
        updatedAt: Date.now(),
        turns,
      }),
    )
  }, [exchanges, activeId])

  const startNew = useCallback(() => {
    controllerRef.current?.abort()
    releaseAudio()
    savedRef.current = ''
    setActiveId(crypto.randomUUID())
    setExchanges([])
  }, [releaseAudio])

  const open = useCallback(
    (id: string) => {
      const conversation = findConversation(id)
      if (!conversation) return

      controllerRef.current?.abort()
      releaseAudio()
      savedRef.current = JSON.stringify(conversation.turns)
      setActiveId(conversation.id)
      setExchanges(conversation.turns.map(toExchange))
    },
    [releaseAudio],
  )

  const remove = useCallback(
    (id: string) => {
      setConversations(deleteConversation(id))
      if (id === activeId) startNew()
    },
    [activeId, startNew],
  )

  const isBusy = exchanges.some(
    (exchange) => exchange.status === 'transcribing' || exchange.status === 'answering',
  )

  return { exchanges, isBusy, conversations, activeId, startNew, open, remove }
}
