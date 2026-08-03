/**
 * Pure reducers over venue presence state.
 *
 * The venue uses ONE presence channel per event (`venue:{eventId}`), not one
 * per room. The presence protocol hands every subscriber the complete state,
 * so per-room occupancy is a client-side groupBy — nine rooms cost one
 * subscription instead of nine.
 *
 * Everything here is a pure function of (presence state, DB roster, now) so
 * it can be unit-tested without a socket. useVenuePresence owns the
 * subscription; this file owns every decision.
 */

import { VENUE } from './constants'
import type {
  VenueAvailability,
  VenueMember,
  VenueOccupant,
  VenuePosition,
  VenuePresencePayload,
} from './types'

/**
 * Shape Supabase hands back from `channel.presenceState()`: one key per
 * tracking client, each holding an array of tracked payloads. Typed loosely
 * on purpose — this module must not import the realtime client.
 */
export type RawPresenceState = Record<
  string,
  Array<Partial<VenuePresencePayload> & { presence_ref?: string }>
>

/**
 * Precedence when one member has several tabs open, highest first.
 *
 * 'busy' outranks everything a second tab might claim: an explicit "do not
 * disturb" set in one window must never be softened because another window
 * is idle-reporting. 'help_wanted' outranks 'working' for the same reason in
 * the opposite direction — an unanswered ask for help is the one status the
 * venue exists to surface.
 */
const AVAILABILITY_RANK: Record<VenueAvailability, number> = {
  busy: 4,
  help_wanted: 3,
  working: 2,
  away: 1,
  offline: 0,
}

/** Order occupant lists are rendered in. Needs-help first, by design. */
const LIST_RANK: Record<VenueAvailability, number> = {
  help_wanted: 0,
  working: 1,
  busy: 2,
  away: 3,
  offline: 4,
}

export function strongerAvailability(
  a: VenueAvailability,
  b: VenueAvailability
): VenueAvailability {
  return AVAILABILITY_RANK[a] >= AVAILABILITY_RANK[b] ? a : b
}

function isPayload(
  p: Partial<VenuePresencePayload> | undefined
): p is VenuePresencePayload {
  return !!p && typeof p.user_id === 'string' && p.user_id.length > 0
}

/**
 * A position off another client is untrusted input like anything else on the
 * wire: a NaN would put an avatar at `translate(NaN)` and remove it from the
 * map entirely, so anything not finite becomes "no position".
 */
export function normalizePos(raw: unknown): VenuePosition | null {
  const p = raw as Partial<VenuePosition> | null | undefined
  if (!p || typeof p !== 'object') return null
  const x = Number(p.x)
  const y = Number(p.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const f = Number(p.f)
  return { x, y, f: Number.isFinite(f) ? Math.max(0, Math.trunc(f)) : 0 }
}

/**
 * Collapse raw presence state into one entry per member.
 *
 * Two tabs are one person. The room shown is the one from the *last* tracked
 * entry rather than a merge, because "which room am I in" has no meaningful
 * union — someone with two tabs open is really in the room they most
 * recently entered.
 */
export function presenceToOccupants(state: RawPresenceState): VenueOccupant[] {
  const byUser = new Map<string, VenueOccupant>()

  for (const entries of Object.values(state || {})) {
    for (const raw of entries || []) {
      if (!isPayload(raw)) continue

      const existing = byUser.get(raw.user_id)
      const availability: VenueAvailability = raw.availability || 'working'

      if (!existing) {
        byUser.set(raw.user_id, {
          user_id: raw.user_id,
          display_name: raw.display_name ?? null,
          avatar_url: raw.avatar_url ?? null,
          role: raw.role || 'participant',
          availability,
          status_note: raw.status_note ?? null,
          room_id: raw.room_id ?? null,
          pos: normalizePos(raw.pos),
          is_live: true,
        })
        continue
      }

      existing.availability = strongerAvailability(existing.availability, availability)
      existing.room_id = raw.room_id ?? existing.room_id
      existing.pos = normalizePos(raw.pos) ?? existing.pos
      existing.status_note = existing.status_note ?? raw.status_note ?? null
      existing.display_name = existing.display_name ?? raw.display_name ?? null
      existing.avatar_url = existing.avatar_url ?? raw.avatar_url ?? null
    }
  }

  return Array.from(byUser.values())
}

/**
 * Merge live presence with the DB roster.
 *
 * The rule, and it only goes one way: **live presence always wins.** The
 * `venue_members` row is a throttled mirror, consulted only for members with
 * no presence entry at all — for first paint before the channel syncs, and
 * for viewers who are not on the channel. A mirrored row older than
 * VENUE.STALE_AFTER_MS renders as 'offline' rather than as whatever it last
 * said, because a two-hour-old "working" is a lie.
 */
export function mergeRoster(
  live: VenueOccupant[],
  roster: VenueMember[] | undefined,
  nowMs: number
): VenueOccupant[] {
  const out = new Map<string, VenueOccupant>()
  for (const o of live) out.set(o.user_id, o)

  for (const m of roster || []) {
    if (out.has(m.user_id)) continue

    const seenMs = Date.parse(m.last_seen_at)
    const stale = !Number.isFinite(seenMs) || nowMs - seenMs > VENUE.STALE_AFTER_MS

    out.set(m.user_id, {
      user_id: m.user_id,
      display_name: m.user?.display_name ?? null,
      avatar_url: m.user?.avatar_url ?? null,
      role: m.role,
      availability: stale ? 'offline' : m.availability,
      status_note: stale ? null : m.status_note,
      room_id: stale ? null : m.current_room_id,
      pos: stale ? null : normalizePos((m.meta as { pos?: unknown } | null)?.pos),
      is_live: false,
    })
  }

  return Array.from(out.values())
}

/**
 * Occupancy per room id. Offline members are excluded — an occupancy badge
 * counts people you could talk to right now, not people who were here.
 */
export function occupancyByRoom(occupants: VenueOccupant[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const o of occupants) {
    if (!o.room_id || o.availability === 'offline') continue
    counts[o.room_id] = (counts[o.room_id] || 0) + 1
  }
  return counts
}

/** Everyone currently in one room, ordered for display. */
export function occupantsInRoom(
  occupants: VenueOccupant[],
  roomId: string
): VenueOccupant[] {
  return sortOccupants(
    occupants.filter((o) => o.room_id === roomId && o.availability !== 'offline')
  )
}

/** Members inside the venue but not inside any room — the "lobby". */
export function occupantsUnassigned(occupants: VenueOccupant[]): VenueOccupant[] {
  return sortOccupants(
    occupants.filter((o) => !o.room_id && o.availability !== 'offline')
  )
}

export function sortOccupants(occupants: VenueOccupant[]): VenueOccupant[] {
  return [...occupants].sort((a, b) => {
    const rank = LIST_RANK[a.availability] - LIST_RANK[b.availability]
    if (rank !== 0) return rank
    return (a.display_name || '').localeCompare(b.display_name || '')
  })
}

/**
 * What availability this client should be reporting.
 *
 * Auto-away exists so a venue full of forgotten tabs does not read as a venue
 * full of working people. But a *manual* status is sticky: someone who set
 * "Do not disturb" and then switched tabs must not be quietly downgraded to
 * "Away", because they chose the stronger signal on purpose.
 */
export function resolveAvailability(args: {
  manual: Exclude<VenueAvailability, 'offline'> | null
  hidden: boolean
  lastInteractionMs: number
  nowMs: number
  idleAfterMs?: number
}): Exclude<VenueAvailability, 'offline'> {
  const { manual, hidden, lastInteractionMs, nowMs } = args
  const idleAfter = args.idleAfterMs ?? VENUE.IDLE_AFTER_MS

  if (manual && manual !== 'working') return manual

  const idle = nowMs - lastInteractionMs >= idleAfter
  if (hidden && idle) return 'away'
  return manual ?? 'working'
}

/** True when the cold-path heartbeat is due. Change always forces a write. */
export function shouldHeartbeat(args: {
  lastWriteMs: number | null
  nowMs: number
  changed: boolean
  throttleMs?: number
}): boolean {
  if (args.changed) return true
  if (args.lastWriteMs === null) return true
  return args.nowMs - args.lastWriteMs >= (args.throttleMs ?? VENUE.HEARTBEAT_THROTTLE_MS)
}
