/**
 * The parts of the Whisper caption engine that need no microphone, network or
 * session, kept apart so they can be tested on their own. See whisper-speech.ts.
 */

export interface DetectorOptions {
  /** RMS level that always counts as voice, whatever the room noise. */
  threshold: number
  /** A phrase ends after this much quiet. */
  silenceMs: number
  /** Shorter than this is a cough or a click, not a phrase. */
  minMs: number
  /** Longer than this is cut, so a monologue still captions every few seconds. */
  maxMs: number
}

/**
 * Tuned for a laptop microphone in a meeting. Each phrase is one request, and
 * Groq bills every request as at least ten seconds, so phrases are allowed to
 * run long rather than being chopped at every breath.
 */
export const DEFAULT_DETECTOR: DetectorOptions = {
  threshold: 0.015,
  silenceMs: 900,
  minMs: 600,
  maxMs: 12_000,
}

export type DetectorEvent = 'start' | 'end' | 'cancel' | null

/**
 * Finds phrases in a stream of microphone levels. Voice is anything well
 * above the room's own noise, which is learned while nobody is speaking.
 */
export function createUtteranceDetector(options: DetectorOptions = DEFAULT_DETECTOR) {
  let speaking = false
  let startedAt = 0
  let lastVoice = 0
  let noiseFloor = options.threshold / 2

  return {
    feed(level: number, now: number): DetectorEvent {
      const threshold = Math.max(options.threshold, noiseFloor * 2.5)
      const voiced = level >= threshold

      if (!speaking) {
        if (voiced) {
          speaking = true
          startedAt = now
          lastVoice = now
          return 'start'
        }
        noiseFloor = noiseFloor * 0.98 + level * 0.02
        return null
      }

      if (voiced) lastVoice = now
      if (now - startedAt >= options.maxMs) {
        speaking = false
        return 'end'
      }
      if (now - lastVoice >= options.silenceMs) {
        speaking = false
        return lastVoice - startedAt >= options.minMs ? 'end' : 'cancel'
      }
      return null
    },
    isSpeaking: () => speaking,
  }
}

/** Root-mean-square level of one frame of samples, 0 to 1. */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/** The first recording format the browser offers that Whisper accepts. */
export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  for (const type of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg']) {
    if (isSupported(type)) return type
  }
  return null
}

/** Can this browser record phrases from the microphone at all? */
export function isWhisperCaptureSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    pickMimeType((type) => MediaRecorder.isTypeSupported(type)) !== null
  )
}

export type WhisperCaptionError =
  | 'speech-day-cap'
  | 'speech-user-day-cap'
  | 'speech-busy'
  | 'speech-not-allowed'
  | 'speech-unavailable'
  | 'speech-error'
  | 'speech-no-mic'

/** Which error a failed transcribe request means, and whether captions must stop. */
export function transcribeError(status: number, reason?: unknown): { code: WhisperCaptionError; fatal: boolean } {
  if (status === 429) {
    if (reason === 'busy') return { code: 'speech-busy', fatal: false }
    if (reason === 'user_day_cap') return { code: 'speech-user-day-cap', fatal: true }
    return { code: 'speech-day-cap', fatal: true }
  }
  if (status === 403) return { code: 'speech-not-allowed', fatal: true }
  if (status === 503) return { code: 'speech-unavailable', fatal: true }
  if (status === 401) return { code: 'speech-error', fatal: true }
  return { code: 'speech-error', fatal: false }
}
