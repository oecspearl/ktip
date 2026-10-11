/**
 * Speech recognition, feature-detected, plus a lock so two features never
 * fight over the microphone.
 *
 * Chrome allows one recognition session per page: starting a second silently
 * aborts the first. Live captions and voice commands both want the mic, so
 * whoever needs it takes the lock, and a higher-priority taker (captions in a
 * live room) preempts a lower one (voice commands), which is told why.
 */

interface RecognitionResultLike {
  isFinal: boolean
  0: { transcript: string; confidence?: number }
}
interface RecognitionEventLike extends Event {
  resultIndex: number
  results: { length: number; [i: number]: RecognitionResultLike }
}
export interface RecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => RecognitionLike

export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const recognitionSupported = () => recognitionCtor() !== null

/** iOS exposes recognition but drops continuous sessions; push-to-talk only there. */
export const continuousSupported = () =>
  recognitionSupported() && !(typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent))

export type RecognitionError = 'not-allowed' | 'unavailable' | 'no-speech' | 'other'

export interface ListenOptions {
  lang: string
  /** Keep listening across pauses, restarting when the engine stops itself */
  continuous?: boolean
  onText: (text: string, final: boolean) => void
  onError?: (error: RecognitionError) => void
  /** The session is over: one utterance done, or stop() called */
  onEnd?: () => void
}

export interface Listener {
  stop(): void
}

/** Start listening. Returns null when the browser has no recognition. */
export function listen(opts: ListenOptions, Ctor: RecognitionCtor | null = recognitionCtor()): Listener | null {
  if (!Ctor) return null
  let wanted = true
  let current: RecognitionLike | null = null

  const build = () => {
    const r = new Ctor()
    r.lang = opts.lang
    r.continuous = !!opts.continuous
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0]?.transcript?.trim()
        if (text) opts.onText(text, e.results[i].isFinal)
      }
    }
    r.onerror = (e) => {
      const code = e.error ?? 'other'
      if (code === 'aborted') return
      if (code === 'no-speech') {
        // Routine in continuous mode; worth a word in push-to-talk
        if (!opts.continuous) opts.onError?.('no-speech')
        return
      }
      wanted = false
      opts.onError?.(
        code === 'not-allowed' ? 'not-allowed' : code === 'network' || code === 'service-not-allowed' ? 'unavailable' : 'other'
      )
    }
    r.onend = () => {
      // The engine ends itself after silence; keep going while wanted
      if (wanted && opts.continuous) {
        setTimeout(() => {
          if (!wanted) return
          try {
            current = build()
            current.start()
          } catch {
            wanted = false
            opts.onEnd?.()
          }
        }, 250)
        return
      }
      wanted = false
      opts.onEnd?.()
    }
    return r
  }

  try {
    current = build()
    current.start()
  } catch {
    return null
  }
  return {
    stop() {
      wanted = false
      try {
        current?.stop()
      } catch {
        // Already stopped
      }
    },
  }
}

// ---- The microphone lock ----------------------------------------------------

interface Holder {
  owner: string
  priority: number
  onPreempt?: () => void
}
let holder: Holder | null = null

/**
 * Take the microphone. Returns a release function, or null when someone with
 * equal or higher priority holds it. A lower-priority holder is preempted:
 * its onPreempt runs and it must stop.
 */
export function acquireMic(owner: string, priority = 0, onPreempt?: () => void): (() => void) | null {
  if (holder && holder.owner !== owner && holder.priority >= priority) return null
  if (holder && holder.owner !== owner) holder.onPreempt?.()
  const mine: Holder = { owner, priority, onPreempt }
  holder = mine
  return () => {
    if (holder === mine) holder = null
  }
}

export const micHolder = () => holder?.owner ?? null
