import { useCallback, useEffect, useRef, useState } from 'react'

import { isSilent, measureLoudness } from '@/lib/loudness'

export type RecorderStatus = 'idle' | 'recording'

export interface AudioRecording {
  blob: Blob
  mimeType: string
  durationMs: number
  /**
   * Object URL for playback. Revoking is left to whoever renders it — the
   * recorder used to revoke the previous URL on every new recording, which
   * left every earlier turn in the conversation pointing at a freed resource.
   */
  url: string
}

export interface RecorderMessage {
  text: string
  tone: 'error' | 'info'
}

/** Recording longer than this is stopped automatically, to cap upload size and cost. */
const MAX_DURATION_MS = 60_000

/** Anything shorter or smaller than this is treated as silence, not speech. */
const MIN_DURATION_MS = 700
const MIN_BLOB_BYTES = 1024

/** User-facing messages. Albanian — this is product text. */
const MESSAGES = {
  unsupported:
    'Shfletuesi juaj nuk e mbeshtet regjistrimin e zerit. Provo me Chrome, Edge ose Safari te perditesuar.',
  insecure:
    'Regjistrimi i zerit kerkon nje lidhje te sigurt (HTTPS) ose hapjen e faqes ne localhost.',
  denied:
    'Nuk u dha leje per mikrofonin. Lejoje aksesin ne cilesimet e shfletuesit dhe provo serish.',
  notFound: 'Nuk u gjet asnje mikrofon. Lidh nje mikrofon dhe provo serish.',
  inUse:
    'Mikrofoni po perdoret nga nje aplikacion tjeter. Mbylle ate aplikacion dhe provo serish.',
  empty: 'Nuk u regjistrua asnje ze. Provo serish dhe fol me afer mikrofonit.',
  failed: 'Regjistrimi deshtoi. Provo serish.',
  maxDuration: 'Regjistrimi u ndal automatikisht pas 60 sekondash.',
} as const

/** Pick a container the browser can actually record. Safari only offers mp4. */
function pickMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

/** Map a getUserMedia rejection onto an Albanian message the user can act on. */
function describeMediaError(error: unknown): string {
  if (!(error instanceof Error)) return MESSAGES.failed

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return MESSAGES.denied
    case 'NotFoundError':
    case 'OverconstrainedError':
      return MESSAGES.notFound
    case 'NotReadableError':
      return MESSAGES.inUse
    default:
      return MESSAGES.failed
  }
}

/**
 * Push-to-talk recorder: `start()` opens the microphone, `stop()` closes it and
 * resolves the captured audio.
 *
 * The microphone stream is always released on stop, on error and on unmount, so
 * the browser's recording indicator never outlives an actual recording.
 */
export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [message, setMessage] = useState<RecorderMessage | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recording, setRecording] = useState<AudioRecording | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null

    if (tickRef.current) clearInterval(tickRef.current)
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    tickRef.current = null
    autoStopRef.current = null
  }, [])

  useEffect(() => {
    return () => releaseStream()
  }, [releaseStream])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    recorder.stop()
  }, [])

  const start = useCallback(async () => {
    setMessage(null)

    if (!window.isSecureContext) {
      setMessage({ text: MESSAGES.insecure, tone: 'error' })
      return
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessage({ text: MESSAGES.unsupported, tone: 'error' })
      return
    }

    const mimeType = pickMimeType()
    if (!mimeType) {
      setMessage({ text: MESSAGES.unsupported, tone: 'error' })
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      setMessage({ text: describeMediaError(error), tone: 'error' })
      return
    }

    const recorder = new MediaRecorder(stream, { mimeType })
    streamRef.current = stream
    recorderRef.current = recorder
    chunksRef.current = []
    startedAtRef.current = Date.now()

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onerror = () => {
      releaseStream()
      setStatus('idle')
      setElapsedMs(0)
      setMessage({ text: MESSAGES.failed, tone: 'error' })
    }

    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current
      const blob = new Blob(chunksRef.current, { type: mimeType })

      releaseStream()
      setStatus('idle')
      setElapsedMs(0)

      if (durationMs < MIN_DURATION_MS || blob.size < MIN_BLOB_BYTES) {
        setMessage({ text: MESSAGES.empty, tone: 'error' })
        return
      }

      void (async () => {
        try {
          if (isSilent(await measureLoudness(blob))) {
            setMessage({ text: MESSAGES.empty, tone: 'error' })
            return
          }
        } catch {
          // A container this browser records but cannot decode is not
          // evidence of silence, so let it through rather than blocking a
          // valid recording. The backend still screens the transcript.
        }

        setRecording({ blob, mimeType, durationMs, url: URL.createObjectURL(blob) })
      })()
    }

    recorder.start()
    setStatus('recording')
    setElapsedMs(0)

    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 200)

    autoStopRef.current = setTimeout(() => {
      setMessage({ text: MESSAGES.maxDuration, tone: 'info' })
      stop()
    }, MAX_DURATION_MS)
  }, [releaseStream, stop])

  const toggle = useCallback(() => {
    if (status === 'recording') {
      stop()
    } else {
      void start()
    }
  }, [status, start, stop])

  const dismissMessage = useCallback(() => setMessage(null), [])

  return {
    status,
    message,
    elapsedMs,
    recording,
    toggle,
    dismissMessage,
    maxDurationMs: MAX_DURATION_MS,
  }
}
