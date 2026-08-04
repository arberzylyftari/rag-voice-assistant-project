import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, speakText } from '@/lib/api'

export type SpeechState = 'idle' | 'loading' | 'playing' | 'failed'

export interface UseSpeechOptions {
  /**
   * Called once an autoplay attempt has concluded — played to the end,
   * failed, or was blocked by the browser — never for a manual pause. Hands-
   * free mode uses this to know when it is safe to start listening again
   * without picking up the assistant's own voice.
   */
  onSettled?: () => void
}

/**
 * Reads a piece of text aloud, fetching the audio once and reusing it.
 *
 * Autoplay is attempted but never assumed: browsers block it without a prior
 * user gesture, and although pressing the microphone provides one, the policy
 * varies. A blocked autoplay leaves the control ready to press rather than
 * surfacing an error the user cannot act on.
 */
export function useSpeech(
  text: string | undefined,
  autoPlay: boolean,
  { onSettled }: UseSpeechOptions = {},
) {
  const [state, setState] = useState<SpeechState>('idle')
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const attemptedRef = useRef(false)

  useEffect(() => {
    return () => {
      // The in-flight request is deliberately left alone. React's development
      // double-mount tears this down and rebuilds it within milliseconds, and
      // aborting here cancelled the only autoplay attempt — the retry could
      // never fire, because the effect had already re-run by the time the
      // rejection landed. An unclaimed audio response is cheap; a control
      // that never plays is not.
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const load = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current
    if (!text) return null

    const controller = new AbortController()
    controllerRef.current = controller

    setState('loading')
    setError(null)

    try {
      const blob = await speakText(text, controller.signal)
      const url = URL.createObjectURL(blob)
      urlRef.current = url

      const audio = new Audio(url)
      audio.addEventListener('ended', () => {
        setState('idle')
        onSettled?.()
      })
      audio.addEventListener('pause', () => setState('idle'))
      audioRef.current = audio
      return audio
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        // React's development double-mount aborts the first attempt through
        // the unmount cleanup. Clearing both the state and the attempt flag
        // lets the remount try again — otherwise the control sits on
        // "preparing" forever, which is what this used to do.
        attemptedRef.current = false
        setState('idle')
        return null
      }
      setState('failed')
      setError(cause instanceof ApiError ? cause.message : 'Leximi me ze deshtoi.')
      onSettled?.()
      return null
    }
  }, [text, onSettled])

  const toggle = useCallback(async () => {
    const audio = audioRef.current

    if (audio && !audio.paused) {
      audio.pause()
      return
    }

    const ready = audio ?? (await load())
    if (!ready) return

    try {
      await ready.play()
      setState('playing')
    } catch {
      // Blocked by the browser's autoplay policy, or interrupted.
      setState('idle')
      onSettled?.()
    }
  }, [load, onSettled])

  useEffect(() => {
    if (!autoPlay || attemptedRef.current) return
    attemptedRef.current = true

    if (!text) {
      // Nothing to play — settle immediately rather than leaving a caller
      // that's waiting on this turn (hands-free mode) stuck forever.
      onSettled?.()
      return
    }

    void toggle()
  }, [autoPlay, text, toggle, onSettled])

  return { state, error, toggle }
}
