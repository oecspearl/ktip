import clap from '../assets/emoji/clap.webp'
import fire from '../assets/emoji/fire.webp'
import heart from '../assets/emoji/heart.webp'
import joy from '../assets/emoji/joy.webp'
import party from '../assets/emoji/party.webp'
import thinking from '../assets/emoji/thinking.webp'
import type { RoomReaction } from '../hooks/useRoomSignals'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

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
  label: MessageDescriptor
}

export const REACTION_ART: Record<RoomReaction, ReactionArt> = {
  '👏': { src: clap, label: msg`Applause` },
  '🔥': { src: fire, label: msg`Fire` },
  '❤️': { src: heart, label: msg`Love it` },
  '😂': { src: joy, label: msg`Laughing` },
  '🎉': { src: party, label: msg`Celebrate` },
  '🤔': { src: thinking, label: msg`Thinking` },
}

export function reactionArt(emoji: string): ReactionArt | undefined {
  return REACTION_ART[emoji as RoomReaction]
}
