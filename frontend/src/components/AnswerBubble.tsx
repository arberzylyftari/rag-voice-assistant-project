import { useState } from 'react'
import { ChevronDown, FileText, Info, Pause, Volume2 } from 'lucide-react'

import { LoaderCircle } from '@/components/animate-ui/icons/loader-circle'
import { TypingText } from '@/components/animate-ui/primitives/texts/typing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useSpeech } from '@/hooks/useSpeech'

interface AnswerBubbleProps {
  answer: string
  answered: boolean
  sources: string[]
  /** Set when a follow-up was rewritten before retrieval. */
  resolvedQuestion?: string
  /** Newest answer reads itself aloud; older ones wait to be asked. */
  autoPlay?: boolean
  /** Hands-free mode: called once this answer's speech attempt has concluded. */
  onPlaybackSettled?: () => void
}

/** The assistant's turn: the answer, and the passages it came from. */
export function AnswerBubble({
  answer,
  answered,
  sources,
  resolvedQuestion,
  autoPlay = false,
  onPlaybackSettled,
}: AnswerBubbleProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const speech = useSpeech(answer, autoPlay, { onSettled: onPlaybackSettled })

  const speechLabel =
    speech.state === 'playing'
      ? 'Ndalo leximin'
      : speech.state === 'loading'
        ? 'Duke pergatitur zerin…'
        : 'Lexo me ze'

  return (
    <Card className="mr-auto max-w-[min(90%,46rem)] py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        {resolvedQuestion && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              U kuptua si: <em>{resolvedQuestion}</em>
            </span>
          </p>
        )}

        <p
          className={`text-[0.95rem] leading-relaxed ${
            answered ? '' : 'text-muted-foreground italic'
          }`}
        >
          <TypingText key={answer} text={answer} duration={12} />
        </p>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void speech.toggle()}
            disabled={speech.state === 'loading'}
            aria-label={speechLabel}
            className="-ml-2 gap-1.5 text-muted-foreground"
          >
            {speech.state === 'loading' ? (
              <LoaderCircle animate loop size={14} />
            ) : speech.state === 'playing' ? (
              <Pause className="size-3.5" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
            {speechLabel}
          </Button>

          {answered && sources.length > 0 && (
            <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="xs" className="gap-1.5 text-muted-foreground">
                  <FileText className="size-3.5" />
                  {sources.length === 1 ? '1 burim' : `${sources.length} burime`}
                  <ChevronDown
                    className={`size-3.5 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col items-start gap-1.5 pt-2">
                {sources.map((source) => (
                  <Badge key={source} variant="secondary" className="whitespace-normal text-left">
                    {source}
                  </Badge>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {speech.error && (
          <p className="text-xs text-destructive" role="alert">
            {speech.error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
