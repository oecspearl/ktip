import type { UiLang } from '../i18n/protocol'

/**
 * Choosing a voice to read translations aloud, and deciding when a line is too
 * old to bother reading.
 *
 * Everything uses the browser's own speechSynthesis: free, no key, nothing
 * leaves the device except what the browser itself sends. Within that, some
 * browsers offer much better voices than others. Edge has Microsoft's "Online
 * (Natural)" voices and Chrome has "Google" ones; both are neural and both are
 * free, but they are fetched over the network, so they can start later than a
 * voice installed on the machine. The rule: use a neural voice unless it has
 * been measured starting slowly on this device, then fall back to a local one.
 * A voice that is better but slower is not better for live speech.
 */

/** The parts of SpeechSynthesisVoice this needs, so tests can pass plain objects. */
export interface VoiceLike {
  name: string
  lang: string
  localService: boolean
}

/** A network voice that takes longer than this to start is treated as slow. */
export const SLOW_START_MS = 600

/** A translation this old is behind the speaker; reading it would only add drift. */
export const STALE_MS = 6_000

/** How loud the person being translated is while their translation plays. */
export const DUCKED_VOLUME = 0.25

const NEURAL = /natural|neural|online|google/i

const matchesLang = (voice: VoiceLike, lang: UiLang) => voice.lang.toLowerCase().startsWith(lang)

/** The best voice for a language, or undefined when the browser has none for it. */
export function pickVoice<V extends VoiceLike>(
  voices: readonly V[],
  lang: UiLang,
  slow: ReadonlySet<string>
): V | undefined {
  const forLang = voices.filter((voice) => matchesLang(voice, lang))
  const neural = forLang.find((voice) => !voice.localService && NEURAL.test(voice.name) && !slow.has(voice.name))
  if (neural) return neural
  return forLang.find((voice) => voice.localService) ?? forLang[0]
}

/** Whether a voice's measured start time marks it as too slow for live use. */
export function isSlowStart(voice: VoiceLike, startedAfterMs: number): boolean {
  return !voice.localService && startedAfterMs > SLOW_START_MS
}

export const isStale = (queuedAt: number, now: number): boolean => now - queuedAt > STALE_MS
