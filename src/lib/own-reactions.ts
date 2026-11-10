/**
 * A member's own reactions: up to three emoji of their choosing, on top of the
 * room's standard set (ROOM_REACTIONS).
 *
 * Reactions ride a broadcast channel that every member can write to, so the
 * receiving side decides what it will draw. It used to accept only the
 * standard six. It now accepts any ONE emoji: a single grapheme that is a
 * pictograph or a flag, short enough that it cannot be a sentence in disguise.
 * Letters, digits, spaces and angle brackets are refused outright, so nothing
 * that arrives can read as text.
 *
 * The same rules guard the saved list (set_my_reaction_emojis in 208), so a
 * list read back from the profile never holds anything the room would drop.
 */

export const MAX_OWN_REACTIONS = 3

/** UTF-16 units. A skin tone, a ZWJ family or a flag fits; a phrase does not. */
const MAX_EMOJI_LENGTH = 16
const PICTOGRAPH = /\p{Extended_Pictographic}/u
const FLAG = /^\p{Regional_Indicator}{2}$/u
const TEXTLIKE = /[\p{L}\p{N}\s<>]/u

/** The first user-perceived character of a string: a whole emoji, joiners and all. */
export function firstGrapheme(text: string): string {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Segmenter) {
    for (const { segment } of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) return segment
    return ''
  }
  return Array.from(text)[0] ?? ''
}

export function isReactionEmoji(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EMOJI_LENGTH) return false
  if (TEXTLIKE.test(value)) return false
  if (firstGrapheme(value) !== value) return false
  return PICTOGRAPH.test(value) || FLAG.test(value)
}

/**
 * A saved list made safe to use: valid emoji only, no repeats, none that are
 * already in the standard set, at most three.
 */
export function cleanOwnReactions(list: unknown, standard: readonly string[]): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const item of list) {
    if (!isReactionEmoji(item) || standard.includes(item) || out.includes(item)) continue
    out.push(item)
    if (out.length === MAX_OWN_REACTIONS) break
  }
  return out
}
