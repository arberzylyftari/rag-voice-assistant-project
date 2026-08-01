import { Mic } from 'lucide-react'

import {
  RippleButton,
  RippleButtonRipples,
} from '@/components/animate-ui/components/buttons/ripple'
import { AudioLines } from '@/components/animate-ui/icons/audio-lines'
import { LoaderCircle } from '@/components/animate-ui/icons/loader-circle'

export type MicButtonState = 'idle' | 'recording' | 'processing'

interface MicButtonProps {
  state: MicButtonState
  onToggle: () => void
}

/** Albanian label for each state — doubles as the accessible name. */
const LABELS: Record<MicButtonState, string> = {
  idle: 'Shtyp për të folur',
  recording: 'Ndalo regjistrimin',
  processing: 'Duke transkriptuar…',
}

/**
 * Push-to-talk control: press to start recording, press again to stop.
 *
 * Disabled while a transcription is in flight, so a second press cannot
 * start a new recording on top of one still being processed.
 */
export function MicButton({ state, onToggle }: MicButtonProps) {
  const label = LABELS[state]
  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'

  return (
    <div className="flex flex-col items-center gap-3">
      <RippleButton
        type="button"
        variant={isRecording ? 'destructive' : 'default'}
        onClick={onToggle}
        disabled={isProcessing}
        aria-label={label}
        aria-pressed={isRecording}
        className="size-18 rounded-full [&_svg]:size-7"
      >
        {isProcessing ? (
          <LoaderCircle animate loop size={28} />
        ) : isRecording ? (
          <AudioLines animate loop size={28} />
        ) : (
          <Mic />
        )}
        <RippleButtonRipples />
      </RippleButton>

      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
