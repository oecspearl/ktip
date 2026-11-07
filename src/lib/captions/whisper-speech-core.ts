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
  /**
   * After this long, a phrase is cut at the next short gap between words
   * instead of waiting for a full pause, so captions keep pace with someone
   * who talks without stopping.
   */
  softMs: number
  /** How much quiet counts as a gap between words, once softMs has passed. */
  gapMs: number
  /** Longer than this is cut wherever it is, the last resort for a monologue. */
  maxMs: number
}

/**
 * Tuned for a laptop microphone in a meeting, and for latency within the free
 * tier. Each phrase is one request: Groq allows 20 a minute for the whole
 * organisation and bills each as at least ten seconds. Phrases of about five
 * seconds keep one non-stop speaker near 12 a minute, and captions trail the
 * speaker by a few seconds rather than by a whole sentence.
 */
export const DEFAULT_DETECTOR: DetectorOptions = {
  threshold: 0.015,
  silenceMs: 700,
  minMs: 600,
  softMs: 4_500,
  gapMs: 250,
  maxMs: 9_000,
}

/**
 * split: the phrase so far is done and the speaker is still going, so the
 * next one starts at once. Recording from the gap means the first word after
 * it is never clipped.
 */
export type DetectorEvent = 'start' | 'end' | 'split' | 'cancel' | null

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
      const long = now - startedAt >= options.maxMs
      const atGap = now - startedAt >= options.softMs && now - lastVoice >= options.gapMs
      if (long || atGap) {
        // The next phrase starts here, counted as voiced so its own silence
        // timer runs from the cut. If the speaker had in fact stopped, it
        // ends as a cancel and nothing is sent.
        startedAt = now
        lastVoice = now
        return 'split'
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
