import { useCallback, useEffect, useRef, useState } from 'react'

import type { RecorderStatus } from '@/hooks/useAudioRecorder'
import type { Exchange } from '@/hooks/useConversation'

/**
 * Turns push-to-talk into a continuous listen → answer → speak → listen
 * loop, the way ChatGPT's voice mode works. Push-to-talk itself is untouched;
 * this only changes what happens once the mode is switched on.
 *
 * One speaker at a time — the assistant is never interrupted mid-answer.
 * True full-duplex (barge-in, streaming both directions) was considered and
 * deliberately left out: it needs a different backend transport (OpenAI's
 * Realtime API) and has no clean place to run citation verification before
 * anything is spoken, which is what the grounding guarantee depends on. See
 * `context/decisions.md`.
 */
export function useHandsFree(
  status: RecorderStatus,
  start: (options?: { autoStop?: boolean }) => Promise<boolean>,
  stop: () => void,
  exchanges: Exchange[],
  isBusy: boolean,
) {
  const [enabled, setEnabled] = useState(false)
  const [waitingForSpeech, setWaitingForSpeech] = useState(false)

  // The id of the exchange this turn is already waiting on, so a re-render
  // does not re-arm the wait for an answer already being read.
  const settledForRef = useRef<string | null>(null)
  const startingRef = useRef(false)

  // The newest completed answer needs to finish being read aloud before
  // listening resumes — otherwise the microphone would pick up the
  // assistant's own voice through the speakers.
  useEffect(() => {
    if (!enabled) return
    const last = exchanges[exchanges.length - 1]
    if (last?.status === 'done' && last.answer && last.id !== settledForRef.current) {
      settledForRef.current = last.id
      setWaitingForSpeech(true)
    }
  }, [enabled, exchanges])

  const onAnswerSpoken = useCallback(() => setWaitingForSpeech(false), [])

  // Keep the microphone listening whenever it is genuinely the user's turn:
  // hands-free is on, nothing is being transcribed or answered, and the
  // latest answer (if any) has finished being read.
  //
  // `status !== 'idle'` — not `status === 'recording'` — is the right guard:
  // the recorder is briefly 'finalising' between a recording actually
  // stopping and the decision on whether it held real speech, since that
  // decision requires decoding the audio. Starting a new recording during
  // that gap would overlap the one still being judged.
  useEffect(() => {
    if (!enabled || isBusy || waitingForSpeech) return
    if (status !== 'idle' || startingRef.current) return

    startingRef.current = true
    void start({ autoStop: true }).then((started) => {
      startingRef.current = false
      // The microphone itself failed — permission denied, unsupported
      // browser. Retrying automatically would just hammer getUserMedia;
      // turn hands-free off and let the error banner explain why.
      if (!started) setEnabled(false)
    })
  }, [enabled, isBusy, waitingForSpeech, status, start])

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current
      if (!next) {
        if (status === 'recording') stop()
        setWaitingForSpeech(false)
      }
      return next
    })
  }, [status, stop])

  return { enabled, toggle, waitingForSpeech, onAnswerSpoken }
}
