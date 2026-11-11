import { isUiLang, type UiLang } from '../i18n/protocol'
import { isCallVoice, type CallVoice } from './voice'

/**
 * Who in a call needs whose words, and in which language.
 *
 * Captions used to start only when the SPEAKER pressed "Caption my speech". A
 * listener had no way to ask, so a call between an English speaker and a French
 * one carried nothing unless the right person had pressed the right button.
 * Now each person says what they speak and read, and whether they want
 * subtitles, and the speaker's browser does the rest: it transcribes while at
 * least one person is following, and translates only into the languages those
 * people read.
 *
 * Language state travels as a small reliable message on the call's own data
 * channel rather than as LiveKit participant attributes. Attributes would need
 * `canUpdateOwnMetadata` on the token, and that grant also lets a participant
 * rename themselves mid-call, which this platform cannot allow in rooms with
 * students in them. Every member already holds `canPublishData` (venue_room_grant,
 * listen-only included), so the data channel costs no new permission.
 *
 * Everything here is pure, so the rules can be tested without a call.
 */

export const LANG_TOPIC = 'ktip-call-lang'

/** What one person has said about language. */
export interface CallLangState {
  /** The language their recogniser listens for. */
  speaks: UiLang
  /** The language they read and hear everyone else in. */
  reads: UiLang
  /**
   * True while they want any subtitles at all. Kept for tabs opened before
   * `foreign` existed: they only read this flag.
   */
  subs: boolean
  /** They have paused their own captions for everyone else. */
  paused: boolean
  /**
   * What they want from a speaker in another language. Absent from older
   * clients, which are then followed on `subs` alone.
   */
  foreign?: ForeignMode
  /** They want subtitles for speakers of their own language too (read-along). */
  along?: boolean
  /**
   * What their recogniser is doing for the people following them. Absent from
   * older clients and from anyone nobody follows. It lets a listener's empty
   * subtitle band say why it is empty: before it, a speaker who was muted, on
   * a browser that cannot transcribe, or paused looked exactly like
   * translation not working (2026-11-10 two-device test).
   */
  cap?: CaptionStatus
  /**
   * The voice they asked to be read in when their words are translated aloud
   * (209). One word, never the gender or age behind it. Absent when they have
   * not said.
   */
  voice?: CallVoice
}

/**
 * live: transcribing now. muted: followed, microphone off. paused: they paused
 * their subtitles. cannot: followed, but this browser cannot transcribe them.
 */
export type CaptionStatus = 'live' | 'muted' | 'paused' | 'cannot'

const isCaptionStatus = (value: unknown): value is CaptionStatus =>
  value === 'live' || value === 'muted' || value === 'paused' || value === 'cannot'

/**
 * My own caption status, for the call. Undefined when there is nothing a
 * listener needs to know: I cannot publish, nobody follows me, or the
 * recogniser is still starting.
 */
export function captionStatus({
  canPublish,
  followed,
  paused,
  micOn,
  supported,
  running,
  failed,
}: {
  canPublish: boolean
  followed: boolean
  paused: boolean
  micOn: boolean
  supported: boolean
  running: boolean
  /** The recogniser stopped on an error it cannot get past. */
  failed: boolean
}): CaptionStatus | undefined {
  if (!canPublish) return undefined
  if (paused) return 'paused'
  if (!followed) return undefined
  if (!supported || failed) return 'cannot'
  if (!micOn) return 'muted'
  return running ? 'live' : undefined
}

/** Someone else in the call, as a listener's subtitle area sees them. */
export interface NoticePerson {
  name: string
  cap?: CaptionStatus
  /** LiveKit hears them talking right now. */
  speaking: boolean
}

export type SubtitleNotice =
  | { kind: 'cannot' | 'paused' | 'muted'; name: string }
  | { kind: 'all-muted' }
  | { kind: 'waiting' }

/**
 * What a listener's subtitle area says while no subtitle is showing.
 *
 * Whose microphone is off, and who cannot be subtitled, is said anywhere,
 * video included: with nothing there, an empty picture looked exactly like
 * subtitles not working (2026-11-10). Only "waiting" keeps to a band, where
 * there is room for it; over video, live and silent needs no words.
 */
export function subtitleNotice(people: readonly NoticePerson[], band: boolean): SubtitleNotice | null {
  const talking = people.find((p) => p.speaking && (p.cap === 'cannot' || p.cap === 'paused'))
  if (talking?.cap === 'cannot' || talking?.cap === 'paused') return { kind: talking.cap, name: talking.name }
  if (people.some((p) => p.cap === 'live')) return band ? { kind: 'waiting' } : null
  const muted = people.filter((p) => p.cap === 'muted')
  if (muted.length === 1) return { kind: 'muted', name: muted[0].name }
  if (muted.length > 1) return { kind: 'all-muted' }
  const stuck = people.find((p) => p.cap === 'cannot' || p.cap === 'paused')
  if (stuck?.cap === 'cannot' || stuck?.cap === 'paused') return { kind: stuck.cap, name: stuck.name }
  return null
}

/**
 * What a listener gets from someone speaking another language.
 *
 *   voice      their words translated, as subtitles AND read aloud, with their
 *              own voice muted. The default (2026-11-10): Delon's rule is that
 *              a listener in another language never hears the original unless
 *              they ask for it.
 *   subtitles  translated subtitles over their own voice, like a film.
 *   original   nothing: their own voice, no subtitles.
 */
export type ForeignMode = 'voice' | 'subtitles' | 'original'

export const DEFAULT_FOREIGN: ForeignMode = 'voice'

export const isForeignMode = (value: unknown): value is ForeignMode =>
  value === 'voice' || value === 'subtitles' || value === 'original'

/** Whether a listener wants any subtitles at all: the legacy `subs` flag. */
export const wantsAnySubtitles = (foreign: ForeignMode, along: boolean): boolean => along || foreign !== 'original'

/** Whether a subtitle line in `lang` is shown to a listener who reads `reads`. */
export function showsLine(lang: UiLang, reads: UiLang, foreign: ForeignMode, along: boolean): boolean {
  return lang === reads ? along : foreign !== 'original'
}

interface LangWire extends CallLangState {
  v: 1
}

export function encodeLangState(state: CallLangState): Uint8Array {
  const wire: LangWire = { v: 1, ...state }
  return new TextEncoder().encode(JSON.stringify(wire))
}

/** Null for anything that is not a well-formed v1 message. Never throws. */
export function decodeLangState(payload: Uint8Array): CallLangState | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(payload)) as Partial<LangWire>
    if (raw?.v !== 1 || !isUiLang(raw.speaks) || !isUiLang(raw.reads)) return null
    const state: CallLangState = { speaks: raw.speaks, reads: raw.reads, subs: raw.subs === true, paused: raw.paused === true }
    // Still v1: an older client ignores the field, and a status it does not
    // know is dropped here rather than failing the whole message.
    if (isCaptionStatus(raw.cap)) state.cap = raw.cap
    if (isCallVoice(raw.voice)) state.voice = raw.voice
    // Both or neither: `along` means nothing without the mode it sits beside.
    if (isForeignMode(raw.foreign)) {
      state.foreign = raw.foreign
      state.along = raw.along === true
    }
    return state
  } catch {
    return null
  }
}

export interface Audience {
  /** People with subtitles on, other than me. */
  total: number
  /** How many of them read each language. */
  byLang: Partial<Record<UiLang, number>>
  /** Languages my words must be translated into. Never includes my own. */
  targets: UiLang[]
}

/** Whether this listener wants my words translated into their language. */
function wantsTranslation(person: CallLangState, speaks: UiLang): boolean {
  if (person.reads === speaks) return false
  return person.foreign ? person.foreign !== 'original' : person.subs
}

/**
 * Whether this listener needs my recogniser running. Someone in another
 * language follows me by default; someone in mine only when they asked to read
 * along. An older client is followed on its one flag.
 */
export function followsSpeaker(person: CallLangState, speaks: UiLang): boolean {
  if (!person.foreign) return person.subs
  return person.along === true || wantsTranslation(person, speaks)
}

/**
 * Who is following me.
 *
 * Everyone who needs my words counts, translated or not. Only those who read
 * another language and want it translated add a translation target, and none
 * do when the room's organiser has switched live translation off: they still
 * get my words as spoken.
 */
export function audienceFor(
  others: Iterable<CallLangState>,
  speaks: UiLang,
  translationAllowed: boolean
): Audience {
  const byLang: Partial<Record<UiLang, number>> = {}
  const targets = new Set<UiLang>()
  let total = 0
  for (const person of others) {
    if (!followsSpeaker(person, speaks)) continue
    total += 1
    byLang[person.reads] = (byLang[person.reads] ?? 0) + 1
    if (translationAllowed && wantsTranslation(person, speaks)) targets.add(person.reads)
  }
  return { total, byLang, targets: [...targets].sort() }
}

/**
 * Whether to tell a listener, once, that someone talking is being translated
 * for them: only when that person speaks another language and translation is
 * actually happening. Nothing to say about my own language.
 */
export function shouldNotice({
  foreign,
  myLang,
  speakerLang,
  translationAllowed,
}: {
  foreign: ForeignMode
  myLang: UiLang
  speakerLang: UiLang | null | undefined
  translationAllowed: boolean
}): boolean {
  return translationAllowed && foreign !== 'original' && !!speakerLang && speakerLang !== myLang
}

/** Why a speaker's own voice is at the volume it is, for ?calldebug. */
export type MixReason =
  | 'translated'
  | 'same-language'
  | 'unknown-language'
  | 'wants-original'
  | 'subtitles-only'
  | 'room-off'
  | 'not-transcribed'
  | 'no-captions'
  | 'untranslated'

/**
 * How loud a speaker's own voice plays for me: 0 when only their translation
 * should reach me, 1 otherwise.
 *
 * Muted from their first word: they speak another language, I chose the
 * translated voice, and the room allows it. It used to wait for their browser
 * to say it was transcribing (`cap: 'live'`), and until that arrived the
 * start of every first sentence came through in their own voice (2026-11-10).
 *
 * Their voice comes back only when translation is known to be failing: their
 * browser says it cannot subtitle them or they paused it, they have talked
 * for a while with no line arriving, or a line has waited too long for its
 * translation. So a listener is not left in silence by a failure they cannot
 * see, and hears nothing of the original otherwise.
 */
export function originalVolume({
  foreign,
  translationAllowed,
  reads,
  theirSpeaks,
  theirCap,
  untranslated,
  noCaptions = false,
}: {
  foreign: ForeignMode
  translationAllowed: boolean
  reads: UiLang
  theirSpeaks: UiLang | undefined
  theirCap: CaptionStatus | undefined
  /** Their newest line has waited too long for a translation (`awaitsTranslation`). */
  untranslated: boolean
  /** They have been talking a while and no line has come from them (`talkingWithoutCaptions`). */
  noCaptions?: boolean
}): { volume: 0 | 1; reason: MixReason } {
  if (!theirSpeaks) return { volume: 1, reason: 'unknown-language' }
  if (theirSpeaks === reads) return { volume: 1, reason: 'same-language' }
  if (foreign === 'original') return { volume: 1, reason: 'wants-original' }
  if (foreign === 'subtitles') return { volume: 1, reason: 'subtitles-only' }
  if (!translationAllowed) return { volume: 1, reason: 'room-off' }
  if (theirCap === 'cannot' || theirCap === 'paused') return { volume: 1, reason: 'not-transcribed' }
  if (noCaptions) return { volume: 1, reason: 'no-captions' }
  if (untranslated) return { volume: 1, reason: 'untranslated' }
  return { volume: 0, reason: 'translated' }
}

/** How long a line may wait for its translation before the speaker's own voice comes back. */
export const UNTRANSLATED_GRACE_MS = 5_000

/**
 * Whether a speaker's newest line has gone unanswered by the translator for
 * longer than the grace period: the translate route is failing, or the speaker
 * does not know I want their words in my language. A line the speaker chose
 * not to translate (a number, a name) does not count.
 */
export function awaitsTranslation(
  newest: { lang: UiLang; at: number; translated: boolean; plain: boolean } | undefined,
  reads: UiLang,
  now: number
): boolean {
  if (!newest || newest.lang === reads || newest.translated || newest.plain) return false
  return now - newest.at > UNTRANSLATED_GRACE_MS
}

/**
 * How long someone may talk with no line arriving from them before their own
 * voice comes back. Longer than a translation's grace: Whisper sends a phrase
 * only every few seconds.
 */
export const NO_CAPTION_GRACE_MS = 8_000

/**
 * Whether a speaker whose browser says it is transcribing (`cap: 'live'`) has
 * been talking for longer than the grace period with nothing to show for it.
 * A recogniser can report running and hear nothing (Edge, 2026-11-10); without
 * this the listener would sit in silence with the original muted.
 *
 * `waitingSince` is when they started talking after their last line arrived.
 */
export function talkingWithoutCaptions(waitingSince: number | undefined, newestAt: number | undefined, now: number): boolean {
  if (waitingSince === undefined) return false
  if (newestAt !== undefined && newestAt >= waitingSince) return false
  return now - waitingSince > NO_CAPTION_GRACE_MS
}
