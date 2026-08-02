import { Card, CardContent } from '@/components/ui/card'
import { formatDuration } from '@/lib/format'

interface QuestionBubbleProps {
  /** Absent while the recording is still being transcribed. */
  text?: string
  durationMs: number
  audioUrl: string
}

/** The user's turn: their question, with the recording still playable. */
export function QuestionBubble({ text, durationMs, audioUrl }: QuestionBubbleProps) {
  return (
    <Card className="ml-auto max-w-[85%] bg-secondary py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        {text ? (
          <p className="text-[0.95rem] leading-relaxed">{text}</p>
        ) : (
          <p className="text-[0.95rem] text-muted-foreground italic">Duke transkriptuar…</p>
        )}
        <div className="flex items-center gap-3">
          <audio className="h-8 max-w-full" src={audioUrl} controls />
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {formatDuration(durationMs)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
