import { TypingText } from '@/components/animate-ui/primitives/texts/typing'
import { Card, CardContent } from '@/components/ui/card'
import { formatDuration } from '@/lib/format'

interface QuestionBubbleProps {
  text: string
  durationMs: number
  audioUrl: string
}

/** The user's transcribed question, with its recording available for playback. */
export function QuestionBubble({ text, durationMs, audioUrl }: QuestionBubbleProps) {
  return (
    <Card className="ml-auto max-w-[85%] bg-secondary py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="text-[0.95rem] leading-relaxed">
          {/* Keyed on the text so a new question retypes instead of resuming. */}
          <TypingText key={text} text={text} duration={18} />
        </p>
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
