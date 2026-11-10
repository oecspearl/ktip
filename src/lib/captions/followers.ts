import { isUiLang, type UiLang } from '../i18n/protocol'

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
  /** True while they want subtitles, translated or not. */
  subs: boolean
  /** They have paused their own captions for everyone else. */
  paused: boolean
}

/** A listener's answer to "follow along in your language?". */
export type FollowChoice = 'ask' | 'captions' | 'voice' | 'off'

export const isFollowChoice = (value: unknown): value is FollowChoice =>
  value === 'ask' || value === 'captions' || value === 'voice' || value === 'off'

/** Subtitles are on for either "yes" answer. */
export const wantsSubtitles = (choice: FollowChoice): boolean => choice === 'captions' || choice === 'voice'

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
    return { speaks: raw.speaks, reads: raw.reads, subs: raw.subs === true, paused: raw.paused === true }
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

/**
 * Who is following me.
 *
 * Anyone with subtitles on counts, including people who read my own language:
 * they want to read along, so my recogniser has to run for them too. Only the
 * ones who read another language add a translation target, and none do when
 * the room's organiser has switched live translation off.
 */
export function audienceFor(
  others: Iterable<CallLangState>,
  speaks: UiLang,
  translationAllowed: boolean
): Audience {
  const byLang: Partial<Record<UiLang, number>> = {}
  let total = 0
  for (const person of others) {
    if (!person.subs) continue
    total += 1
    byLang[person.reads] = (byLang[person.reads] ?? 0) + 1
  }
  const targets = translationAllowed
    ? (Object.keys(byLang) as UiLang[]).filter((lang) => lang !== speaks).sort()
    : []
  return { total, byLang, targets }
}

/**
 * Whether to offer a listener translation for someone who is talking.
 *
 * Only when that person speaks another language, the listener has not answered
 * yet, and the room allows translation. Someone who speaks the listener's own
 * language is never a reason to interrupt them.
 */
export function shouldOffer({
  choice,
  myLang,
  speakerLang,
  translationAllowed,
}: {
  choice: FollowChoice
  myLang: UiLang
  speakerLang: UiLang | null | undefined
  translationAllowed: boolean
}): boolean {
  return translationAllowed && choice === 'ask' && !!speakerLang && speakerLang !== myLang
}
