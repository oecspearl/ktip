/**
 * Which person-to-person actions a venue surface may offer.
 *
 * This exists as a pure function, in its own file, with its own test, because
 * it is the safeguarding boundary's UI half and it is easy to get wrong by
 * omission — a "Message" button that renders and then fails is worse than no
 * button, and a venue introduces a lot of new places to put one.
 *
 * The REAL boundary is the database: migration 064 hard-blocks `dm:initiate`
 * for the `student` role inside has_permission(), before the role/permission
 * matrix is even read, so it cannot be granted back by an admin editing the
 * matrix at /admin/roles. Nothing here is a security control. Its only job is
 * to avoid rendering an affordance that the server will refuse.
 *
 * Room chat is deliberately not gated by any of this: venue_room_messages has
 * a room_id and no second participant column, so it cannot express a 1:1
 * conversation. Group-scoped chat is what students get, by construction rather
 * than by policy.
 */

import type { VenueRole } from '../types'

export interface DmContext {
  /** auth.can('dm:initiate') — false for students, and for suspended members. */
  canInitiateDm: boolean
  /** Is the target the signed-in member themselves? */
  isSelf: boolean
  /** The target's venue role. */
  targetRole: VenueRole
  /** Is the target present with a live presence entry? */
  targetIsLive?: boolean
}

/**
 * Offer a direct message?
 *
 * Spectators are excluded as targets: they are watching, not participating, and
 * a spectator did not opt into being contacted by everyone in the venue.
 */
export function canDirectMessage(ctx: DmContext): boolean {
  if (!ctx.canInitiateDm) return false
  if (ctx.isSelf) return false
  if (ctx.targetRole === 'spectator') return false
  return true
}

/**
 * Offer a profile drawer? Always, including for yourself — the drawer is how
 * you check what everyone else can see about you.
 */
export function canViewProfile(_ctx: Pick<DmContext, 'targetRole'>): boolean {
  return true
}

/**
 * Offer "ask them to join my room"? Only useful for someone who is actually
 * connected, and never for a spectator (they cannot publish anyway).
 */
export function canInviteToRoom(ctx: DmContext): boolean {
  if (ctx.isSelf) return false
  if (ctx.targetRole === 'spectator') return false
  return ctx.targetIsLive !== false
}
