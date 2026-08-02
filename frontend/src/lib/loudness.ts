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
