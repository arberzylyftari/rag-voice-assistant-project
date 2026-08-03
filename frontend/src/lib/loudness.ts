/**
 * Loudness measurement used to reject recordings that contain no speech.
 *
 * This is a correctness guard, not a nicety. The transcription model does not
 * return an empty string for silent audio — it invents a fluent, plausible
 * question, sometimes echoing its own steering prompt and sometimes producing
 * an entirely new one. A fabricated question is indistinguishable from a real
 * one by the time it reaches retrieval, so silence has to be caught here,
 * before the audio is ever uploaded.
 *
 * Thresholds come from measuring the project's own fixtures:
 *
 * | Signal                   | RMS     |
 * | ------------------------ | ------- |
 * | Digital silence          | 0.00003 |
 * | Pink noise (room-ish)    | 0.00186 |
 * | Louder pink noise        | 0.00327 |
 * | Albanian speech          | 0.075–0.098 |
 *
 * 0.005 sits about 2.7x above the loudest non-speech sample and far below
 * the quietest speech, leaving room for a soft speaker or a short utterance
 * diluted across a longer recording.
 */

const RMS_THRESHOLD = 0.005

/** A brief loud utterance can dilute below the RMS floor; peak catches it. */
const PEAK_THRESHOLD = 0.05

export interface Loudness {
  rms: number
  peak: number
}

/** Decode the recording and measure its RMS and peak amplitude. */
export async function measureLoudness(blob: Blob): Promise<Loudness> {
  const context = new AudioContext()

  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())

    let sumOfSquares = 0
    let sampleCount = 0
    let peak = 0

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel)

      for (let i = 0; i < samples.length; i += 1) {
        const sample = samples[i]
        sumOfSquares += sample * sample
        const magnitude = Math.abs(sample)
        if (magnitude > peak) peak = magnitude
      }

      sampleCount += samples.length
    }

    return {
      rms: sampleCount > 0 ? Math.sqrt(sumOfSquares / sampleCount) : 0,
      peak,
    }
  } finally {
    void context.close()
  }
}

export function isSilent({ rms, peak }: Loudness): boolean {
  return rms < RMS_THRESHOLD && peak < PEAK_THRESHOLD
}

/**
 * Live voice-activity detection, for hands-free mode.
 *
 * `measureLoudness` above judges a finished recording after the fact; this
 * watches the microphone stream while it is still being recorded and reports
 * once the user has spoken and then paused, so a hands-free turn can end
 * itself instead of waiting for a button press.
 *
 * The threshold is reasoned from the same measurements documented above —
 * comfortably above the loudest recorded noise sample (0.00327) and below the
 * quietest recorded speech (0.075) — not an independent measurement of its
 * own. Live 100ms windows are burstier than a whole-clip average, so it sits
 * higher than the post-hoc RMS_THRESHOLD to avoid triggering on room noise.
 */
const LIVE_SPEECH_THRESHOLD = 0.02

/** A pause this long after speech has been heard ends the turn. */
const SILENCE_HANGOVER_MS = 1200

const SAMPLE_INTERVAL_MS = 100

export interface VoiceActivityOptions {
  /** Called once, when speech has been heard and then followed by a pause. */
  onSpeechEnd: () => void
  speechThreshold?: number
  silenceHangoverMs?: number
}

export interface VoiceActivityWatcher {
  /** Stop sampling and release the audio graph. Safe to call more than once. */
  stop: () => void
}

/**
 * Watch a live microphone stream and call `onSpeechEnd` once, after the user
 * has spoken and then gone quiet for `silenceHangoverMs`.
 *
 * Runs alongside `MediaRecorder` on the same stream — a stream can have more
 * than one consumer, so this does not affect what gets recorded.
 *
 * Deliberately has no "nothing was ever said" timeout: if the user never
 * speaks, this simply keeps waiting. The recorder's own maximum-duration cap
 * is what ends that case, so a silent turn costs one message a minute rather
 * than a repeating one every few seconds.
 */
export function watchVoiceActivity(
  stream: MediaStream,
  {
    onSpeechEnd,
    speechThreshold = LIVE_SPEECH_THRESHOLD,
    silenceHangoverMs = SILENCE_HANGOVER_MS,
  }: VoiceActivityOptions,
): VoiceActivityWatcher {
  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)

  const samples = new Float32Array(analyser.fftSize)
  let hasSpoken = false
  let silenceStartedAt: number | null = null
  let settled = false
  let stopped = false

  const timer = setInterval(() => {
    if (stopped || settled) return

    analyser.getFloatTimeDomainData(samples)
    let sumOfSquares = 0
    for (let i = 0; i < samples.length; i += 1) sumOfSquares += samples[i] * samples[i]
    const rms = Math.sqrt(sumOfSquares / samples.length)

    if (rms >= speechThreshold) {
      hasSpoken = true
      silenceStartedAt = null
      return
    }

    if (!hasSpoken) return // still waiting for the user to start talking

    silenceStartedAt ??= Date.now()

    if (Date.now() - silenceStartedAt >= silenceHangoverMs) {
      settled = true
      onSpeechEnd()
    }
  }, SAMPLE_INTERVAL_MS)

  const stop = (): void => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    source.disconnect()
    void context.close()
  }

  return { stop }
}
