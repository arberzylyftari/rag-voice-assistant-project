import { useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'

import { LoaderCircle } from '@/components/animate-ui/icons/loader-circle'
import { AnswerBubble } from '@/components/AnswerBubble'
import { QuestionBubble } from '@/components/QuestionBubble'
import type { Exchange } from '@/hooks/useConversation'

interface ConversationProps {
  exchanges: Exchange[]
}

/** The exchanges so far, oldest first. */
export function Conversation({ exchanges }: ConversationProps) {
  const endRef = useRef<HTMLDivElement>(null)

  // Follow the newest turn as it arrives, rather than leaving the user
  // scrolled to where the answer started.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [exchanges])

  if (exchanges.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="font-medium">Ende nuk ka biseda</p>
        <p className="max-w-lg text-sm text-muted-foreground">
          Shtyp butonin e mikrofonit dhe bej nje pyetje, per shembull:{' '}
          <em>"Sa dite pushimi vjetor kam?"</em>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
      {exchanges.map((exchange) => (
        <div key={exchange.id} className="flex flex-col gap-3">
          <QuestionBubble
            text={exchange.question}
            durationMs={exchange.durationMs}
            audioUrl={exchange.audioUrl}
          />

          {exchange.status === 'answering' && (
            <p
              className="mr-auto flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircle animate loop size={16} />
              Duke kerkuar ne dokumente…
            </p>
          )}

          {exchange.status === 'failed' && (
            <p
              className="mr-auto flex items-start gap-2 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {exchange.error}
            </p>
          )}

          {exchange.status === 'done' && exchange.answer && (
            <AnswerBubble
              answer={exchange.answer}
              answered={exchange.answered ?? false}
              sources={exchange.sources ?? []}
              resolvedQuestion={exchange.resolvedQuestion}
              // Only the newest answer speaks on arrival; replaying the
              // history on every render would talk over the user, and a
              // reopened conversation should not start talking by itself —
              // autoplay is for an answer that has just arrived, not one
              // being reviewed.
              autoPlay={
                !exchange.restored && exchange.id === exchanges[exchanges.length - 1]?.id
              }
            />
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
