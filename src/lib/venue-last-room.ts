/**
 * The venue room a member was last inside, for this tab.
 *
 * The map needs it to put you back where you came out: on that room's floor,
 * at its door, with the entry animation played backwards. The session row's
 * `current_room_id` cannot answer that — it is the snapshot from when the venue
 * was joined, and entering a room does not refresh it, so after a first visit
 * to any room the map would put you back on the ground floor.
 *
 * Module state rather than storage: it only has to survive the hop from the
 * room page to the map inside one tab, and a reload already has the session
 * row to fall back on.
 */
let last: { eventId: string; roomId: string } | null = null

/** Called by the room page once the room has resolved. */
export function rememberVenueRoom(eventId: string, roomId: string): void {
  last = { eventId, roomId }
}

/** The room last left in this event, if any. Does not clear it. */
export function lastVenueRoom(eventId: string | null | undefined): string | null {
  return eventId && last?.eventId === eventId ? last.roomId : null
}

/** Forget it, once the map has used it, so a later visit starts at the door. */
export function forgetVenueRoom(eventId: string | null | undefined): void {
  if (eventId && last?.eventId === eventId) last = null
}
