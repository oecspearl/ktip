import { chunkText, pickVoice, toSpokenText } from './voices'

/** Slightly under 1 reads as measured rather than rushed on neural voices. */
export const BASE_RATE = 0.95

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export interface SpeakOptions {
  lang: string
  /** The member's reading speed, multiplied by BASE_RATE */
  rate?: number
  voiceURI?: string
  onEnd?: () => void
  onError?: () => void
}

/**
 * Speak a piece of text in chunks, start to finish. Returns a cancel function
 * that also disarms the callbacks, so cancelling never looks like finishing
 * (a tour's auto-advance would otherwise skip a step the reader just left).
 */
export function speakText(text: string, opts: SpeakOptions): () => void {
  const spoken = toSpokenText(text)
  if (!speechSupported() || !spoken) {
    opts.onEnd?.()
    return () => {}
  }
  const synth = window.speechSynthesis
  const chunks = chunkText(spoken, opts.lang)
  const voice = pickVoice(synth.getVoices(), opts.lang, opts.voiceURI)
  let live = true
  let i = 0

  const next = () => {
    if (!live) return
    if (i >= chunks.length) {
      live = false
      opts.onEnd?.()
      return
    }
    const u = new SpeechSynthesisUtterance(chunks[i++])
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? opts.lang
    u.rate = BASE_RATE * (opts.rate ?? 1)
    u.onend = next
    u.onerror = (e) => {
      if (!live || e.error === 'interrupted' || e.error === 'canceled') return
      live = false
      opts.onError?.()
    }
    synth.speak(u)
  }

  synth.cancel()
  next()
  return () => {
    if (!live) return
    live = false
    synth.cancel()
  }
}

/** The installed voices, waiting briefly for a browser that loads them late. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([])
  const now = window.speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done)
      resolve(window.speechSynthesis.getVoices())
    }
    window.speechSynthesis.addEventListener('voiceschanged', done)
    setTimeout(done, timeoutMs)
  })
}
