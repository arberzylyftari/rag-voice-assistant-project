import { Mic } from 'lucide-react'

import {
  RippleButton,
  RippleButtonRipples,
} from '@/components/animate-ui/components/buttons/ripple'
import { AudioLines } from '@/components/animate-ui/icons/audio-lines'
import { LoaderCircle } from '@/components/animate-ui/icons/loader-circle'

export type MicButtonState = 'idle' | 'recording' | 'processing' | 'speaking'

interface MicButtonProps {
  state: MicButtonState
  onToggle: () => void
}

/** Albanian label for each state — doubles as the accessible name. */
const LABELS: Record<MicButtonState, string> = {
  idle: 'Shtyp per te folur',
  recording: 'Ndalo regjistrimin',
  processing: 'Duke transkriptuar…',
  speaking: 'Duke folur pergjigjen…',
}

/**
 * Push-to-talk control: press to start recording, press again to stop.
 *
 * Disabled while a transcription or answer is in flight, so a second press
 * cannot start a new recording on top of one still being processed. `speaking`
 * — hands-free mode reading the answer aloud — stays clickable: it is the only
 * way to stop hands-free mode while the assistant is talking, since there is
 * no live request to press it against.
 */
export function MicButton({ state, onToggle }: MicButtonProps) {
  const label = LABELS[state]
  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'
  const isSpeaking = state === 'speaking'

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
        {isProcessing || isSpeaking ? (
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
