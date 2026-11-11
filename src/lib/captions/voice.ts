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

/**
 * The voice a speaker asked to be read in (migration 209): from the gender on
 * their profile, and "girl" or "boy" when the account is a minor's. Absent
 * when they have not said, and the device's default voice is used.
 */
export type CallVoice = 'woman' | 'man' | 'girl' | 'boy'

export const isCallVoice = (value: unknown): value is CallVoice =>
  value === 'woman' || value === 'man' || value === 'girl' || value === 'boy'

/**
 * Browsers do not say whether a voice is a woman's or a man's; the name is all
 * there is. These are the names Windows, Edge, Chrome, Android and Apple ship
 * for English, French and Spanish. Women first: "Google UK English Female"
 * contains "male".
 */
const WOMAN =
  /female|woman|hortense|julie|denise|eloise|sylvie|brigitte|am[eé]lie|audrey|aur[eé]lie|marie|c[eé]line|coralie|charline|jacqueline|yvette|vivienne|helena|laura|sabina|elvira|dalia|paulina|m[oó]nica|paloma|elena|luc[ií]a|ximena|yolanda|zira|hazel|susan|jenny|aria|michelle|sonia|libby|samantha|karen|moira|tessa|victoria|fiona|allison|emma|catherine|natasha|clara|google fran[cç]ais|google espa[nñ]ol|google us english/i
const MAN =
  /\bmale\b|\bman\b|paul|henri|claude|thomas|nicolas|alain|j[eé]r[oô]me|maurice|r[eé]my|pablo|[aá]lvaro|jorge|ra[uú]l|diego|juan|carlos|enrique|david|mark|george|\bguy\b|ryan|\beric\b|christopher|brian|andrew|daniel|\balex\b|\bfred\b|oliver|james|william|liam|\btony\b|steffan|roger/i

/** woman, man, or undefined when the name gives nothing away. */
export function voiceGender(name: string): 'woman' | 'man' | undefined {
  if (WOMAN.test(name)) return 'woman'
  if (MAN.test(name)) return 'man'
  return undefined
}

/**
 * A voice for a speaker who asked for one, and the pitch to play it at.
 *
 * A voice of the right gender wins, neural before local as in pickVoice. Where
 * the device has none (many phones have one voice per language), its best
 * voice is used lower or higher instead: not the same thing, but closer than
 * a man read in an unchanged woman's voice. A minor is pitched a little
 * higher, since no browser ships a young voice.
 */
export function pickVoiceFor<V extends VoiceLike>(
  voices: readonly V[],
  lang: UiLang,
  slow: ReadonlySet<string>,
  want: CallVoice | undefined
): { voice: V | undefined; pitch: number } {
  if (!want) return { voice: pickVoice(voices, lang, slow), pitch: 1 }
  const gender = want === 'woman' || want === 'girl' ? 'woman' : 'man'
  const young = want === 'girl' || want === 'boy'
  const matching = voices.filter((voice) => voiceGender(voice.name) === gender)
  const matched = pickVoice(matching, lang, slow)
  if (matched) return { voice: matched, pitch: young ? 1.25 : 1 }
  const voice = pickVoice(voices, lang, slow)
  // The only voice is the other gender's, or says nothing about itself.
  const base = gender === 'man' ? 0.7 : 1.25
  return { voice, pitch: young ? base + 0.2 : base }
}

/** Whether a voice's measured start time marks it as too slow for live use. */
export function isSlowStart(voice: VoiceLike, startedAfterMs: number): boolean {
  return !voice.localService && startedAfterMs > SLOW_START_MS
}

export const isStale = (queuedAt: number, now: number): boolean => now - queuedAt > STALE_MS
