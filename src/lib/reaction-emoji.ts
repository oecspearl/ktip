import clap from '../assets/emoji/clap.png'
import fire from '../assets/emoji/fire.png'
import heart from '../assets/emoji/heart.png'
import joy from '../assets/emoji/joy.png'
import party from '../assets/emoji/party.png'
import thinking from '../assets/emoji/thinking.png'
import type { RoomReaction } from '../hooks/useRoomSignals'

/**
 * The room's reactions, drawn rather than typed.
 *
 * A bare emoji character is rendered by whatever font the reader's OS ships:
 * Segoe on Windows, Apple Color Emoji on a Mac, Noto on most Androids. So the
 * same clap is three different pictures, and on the machine most of this
 * audience uses it is the flattest of the three. These are Microsoft's Fluent
 * Emoji in the 3D style — one set, the same on every screen, and the one that
 * actually looks like the rest of this venue.
 *
 * The character stays the source of truth: it is what rides the broadcast
 * channel, what ROOM_REACTIONS validates against, and the fallback if an image
 * ever fails to load. This is presentation only.
 *
 * Assets: github.com/microsoft/fluentui-emoji (MIT) — see src/assets/emoji/README.md.
 */
export interface ReactionArt {
  src: string
  /** The proper name, for screen readers and tooltips. */
  label: string
}

export const REACTION_ART: Record<RoomReaction, ReactionArt> = {
  '👏': { src: clap, label: 'Applause' },
  '🔥': { src: fire, label: 'Fire' },
  '❤️': { src: heart, label: 'Love it' },
  '😂': { src: joy, label: 'Laughing' },
  '🎉': { src: party, label: 'Celebrate' },
  '🤔': { src: thinking, label: 'Thinking' },
}

export function reactionArt(emoji: string): ReactionArt | undefined {
  return REACTION_ART[emoji as RoomReaction]
}
