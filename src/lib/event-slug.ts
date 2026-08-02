/**
 * Venue URLs: /events/virtual-hackathon/oecs-climathon-virtual-build-weekend
 * rather than /events/<uuid>/venue.
 *
 * The slug is events.slug (migration 087) — the same segment /events/<slug>
 * uses — so the venue lives at a readable address under the event it belongs
 * to. Nothing is derived here: like every other slug in the app it comes off
 * the row, and falls back to the uuid when a row predates the backfill.
 */
import type { Sluggable } from './slug'

/** The floorplan URL for an event. */
export function venuePath(event: Sluggable): string {
  return `/events/virtual-hackathon/${event.slug || event.id}`
}

/**
 * One room inside a venue. Rooms are addressed by venue_rooms.key — the column
 * migration 070 describes as "Stable slug. Deep links and default-room lookups
 * use this, never the name" — so the whole path is human-readable.
 */
export function venueRoomPath(event: Sluggable, roomKey: string): string {
  return `${venuePath(event)}/room/${roomKey}`
}

/**
 * Where a host builds the venue (089). Sits under the venue rather than under
 * /admin because it is step two of creating a hackathon, and the person who
 * just filled in the form is not thinking about an admin console.
 */
export function venueSetupPath(event: Sluggable): string {
  return `${venuePath(event)}/setup`
}
