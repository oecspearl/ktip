/**
 * Speech recognition for the local microphone, via the Web Speech API.
 *
 * Deliberately the browser's own recogniser and not a paid streaming API. Three
 * reasons, in order of how much they matter here:
 *
 *   1. It is free and needs no key, so captions work on a deployment that has
 *      configured nothing. A hackathon should not need a purchase order.
 *   2. It only ever hears the LOCAL microphone — clean, near-field, one known
 *      speaker. Transcribing the room's mixed downstream audio would be worse
 *      quality AND cost per listener rather than per speaker.
 *   3. The speaker's identity is known for free. No diarisation, no guessing who
 *      said what.
 *
 * What it costs: Chrome, Edge and Safari only. Firefox has no implementation, so
 * captioning is offered rather than assumed — see `isSpeechRecognitionSupported`.
 * If that becomes a problem the shape below is a seam: a Soniox or Deepgram
 * WebSocket source implements the same three methods and nothing above changes.
 * Groq's free Whisper is that second source, for Firefox and for browsers whose
 * own speech service is out of reach (whisper-speech.ts, 203).
 */

import { isWhisperCaptureSupported } from './whisper-speech-core'

/**
 * Minimal declarations for the Web Speech API.
 *
 * Not in TypeScript's DOM lib, because the spec has never reached
 * Recommendation. Only the members actually used are declared — a fuller copy
 * would be a fuller lie about what is guaranteed to be there.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: {
    readonly length: number
    [index: number]: SpeechRecognitionResultLike
  }
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  // Safari and Chrome still only expose the prefixed name.
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getConstructor() !== null
}

/**
 * Set on deployments with a Groq key for Firefox captions (203). Public on
 * purpose: it only tells the page that /api/speech/transcribe is worth trying.
 */
export function isWhisperCaptionsEnabled(): boolean {
  const flag = import.meta.env.VITE_WHISPER_CAPTIONS as string | undefined
  return flag === 'on' || flag === 'true' || flag === '1'
}

/** Whisper captions are switched on here, and this browser can record phrases for them. */
export function canCaptionWithWhisper(): boolean {
  return isWhisperCaptionsEnabled() && isWhisperCaptureSupported()
}

export type CaptionEngine = 'browser' | 'whisper'

/**
 * Which recogniser captions this member's speech.
 *
 * The browser's own whenever it has one: instant, free and unlimited. Whisper
 * only where it does not (Firefox), because its free tier is one daily
 * allowance for the whole organisation and its captions arrive a phrase late.
 * A browser whose own speech service turns out to be out of reach moves to
 * Whisper too, once it fails (see `browserSpeechFailure`).
 * Null when neither is available.
 */
export function captionEngine(
  browser: boolean = isSpeechRecognitionSupported(),
  whisper: boolean = canCaptionWithWhisper()
): CaptionEngine | null {
  if (browser) return 'browser'
  if (whisper) return 'whisper'
  return null
}

/**
 * unreachable: this browser's speech service cannot be used here, so retrying
 *   only repeats the error.
 * no-mic: the microphone is refused or missing.
 * transient: one phrase was lost; the recogniser carries on.
 */
export type BrowserSpeechFailure = 'unreachable' | 'no-mic' | 'transient'

/**
 * What a recogniser error means for captioning.
 *
 * Chrome-family recognisers send the audio to the browser maker's speech
 * service. Brave, Opera and other Chromium builds have no access to it, and a
 * firewall or VPN can block it, so they answer `network` on every attempt. A
 * `network` before anything was ever heard, or three in a row, means the
 * service is out of reach. One after captions were working is a blip.
 */
export function browserSpeechFailure(
  error: string,
  heardAnything: boolean,
  networkStrikes: number
): BrowserSpeechFailure {
  if (error === 'not-allowed' || error === 'audio-capture') return 'no-mic'
  if (error === 'service-not-allowed' || error === 'language-not-supported') return 'unreachable'
  if (error === 'network' && (!heardAnything || networkStrikes >= 3)) return 'unreachable'
  return 'transient'
}

export interface SpeechSegment {
  text: string
  /** Interim text is for the speaker's own screen only, and is never broadcast. */
  final: boolean
}

export interface SpeechRecognizer {
  start(): void
  stop(): void
  /** True between start() and stop(), including across silent restarts. */
  isRunning(): boolean
}

export interface SpeechRecognizerOptions {
  /** BCP-47. The speaker's own content language, not the reader's. */
  lang: string
  onSegment: (segment: SpeechSegment) => void
  /** Anything but `transient` has already stopped the recogniser for good. */
  onError?: (error: string, failure: BrowserSpeechFailure) => void
}

/**
 * A recogniser that keeps going.
 *
 * The engine stops itself after a stretch of silence — and in a hackathon room,
 * silence is most of the time. Left alone, captioning appears to work for a
 * minute and then quietly dies, which is worse than not offering it. So `onend`
 * restarts it for as long as the caller wanted it running, and only a real
 * `stop()` or an error retrying cannot fix clears that intent. Restarting into
 * an unreachable service would repeat the same error three times a second.
 */
export function createSpeechRecognizer(options: SpeechRecognizerOptions): SpeechRecognizer {
  const Ctor = getConstructor()
  if (!Ctor) {
    return { start() {}, stop() {}, isRunning: () => false }
  }

  let recognition: SpeechRecognitionLike | null = null
  let wanted = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  // Across restarts: has this browser's service ever answered, and how many
  // `network` errors since it last did.
  let heardAnything = false
  let networkStrikes = 0

  const build = (): SpeechRecognitionLike => {
    const instance = new Ctor()
    instance.lang = options.lang
    instance.continuous = true
    instance.interimResults = true
    // One alternative. Nobody is going to pick between spellings of a caption
    // that is on screen for four seconds.
    instance.maxAlternatives = 1

    instance.onresult = (event) => {
      heardAnything = true
      networkStrikes = 0
      // Only the results added since the last event — re-reading from zero
      // re-emits the whole session on every syllable. Finals go out one by
      // one. Chrome often splits its running guess into a settled part and a
      // changing part, so the interim results are joined into the one text
      // they are.
      const interim: string[] = []
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript?.trim()
        if (!text) continue
        if (result.isFinal) options.onSegment({ text, final: true })
        else interim.push(text)
      }
      if (interim.length > 0) options.onSegment({ text: interim.join(' '), final: false })
    }

    instance.onerror = (event) => {
      const error = (event as Event & { error?: string }).error ?? 'unknown'
      // `no-speech` and `aborted` are routine — somebody stopped talking, or a
      // restart raced a stop. Surfacing them would put an error toast on screen
      // every time a room went quiet.
      if (error === 'no-speech' || error === 'aborted') return
      if (error === 'network') networkStrikes++
      const failure = browserSpeechFailure(error, heardAnything, networkStrikes)
      // Cleared before `onend` fires, so it does not restart.
      if (failure !== 'transient') wanted = false
      options.onError?.(error, failure)
    }

    instance.onend = () => {
      if (!wanted) return
      // A small delay rather than an immediate restart: some engines throw
      // InvalidStateError if start() lands in the same tick as end.
      restartTimer = setTimeout(() => {
        if (!wanted) return
        try {
          instance.start()
        } catch {
          /* already running, or the tab lost the microphone */
        }
      }, 300)
    }

    return instance
  }

  return {
    start() {
      if (wanted) return
      wanted = true
      recognition = build()
      try {
        recognition.start()
      } catch {
        // Almost always "already started" from a double-mount in dev.
      }
    },
    stop() {
      wanted = false
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = null
      }
      try {
        recognition?.stop()
      } catch {
        /* nothing to stop */
      }
      recognition = null
    },
    isRunning: () => wanted,
  }
}
