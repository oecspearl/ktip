/**
 * Venue URLs: /events/virtual-hackathon/oecs-climathon-virtual-build-weekend
 * rather than /events/<uuid>/venue.
 *
 * The slug is events.slug (migration 087) — the same segment /events/<slug>
 * uses — so the venue lives at a readable address under the event it belongs
 * to. Nothing is derived here: like every other slug in the app it comes off
 * the row, and falls back to the uuid when a row predates the backfill.
 *
 * One venue engine, two front doors: conferences get virtual-conference,
 * everything else keeps virtual-hackathon (the legacy segment every bookmark,
 * tutorial route and seeded link already uses). Both segments resolve to the
 * same pages, so a link with the "wrong" segment still works — the builders
 * below only pick the canonical one.
 */
import type { Sluggable } from './slug'

export const VENUE_SEGMENTS = ['virtual-hackathon', 'virtual-conference'] as const
export type VenueSegment = (typeof VENUE_SEGMENTS)[number]

/**
 * Anything venuePath can address: slug/id plus (optionally) the event type
 * that picks the segment. Optional so callers holding only {id, slug} — and
 * every pre-existing call site — still compile; they get the legacy segment.
 */
export type VenueAddressable = Sluggable & { event_type?: string | null }

export function venueSegmentFor(eventType: string | null | undefined): VenueSegment {
  return eventType === 'conference' ? 'virtual-conference' : 'virtual-hackathon'
}

/** The floorplan URL for an event. */
export function venuePath(event: VenueAddressable): string {
  return `/events/${venueSegmentFor(event.event_type)}/${event.slug || event.id}`
}

/**
 * One room inside a venue. Rooms are addressed by venue_rooms.key — the column
 * migration 070 describes as "Stable slug. Deep links and default-room lookups
 * use this, never the name" — so the whole path is human-readable.
 */
export function venueRoomPath(event: VenueAddressable, roomKey: string): string {
  return `${venuePath(event)}/room/${roomKey}`
}

/**
 * Where a host builds the venue (089). Sits under the venue rather than under
 * /admin because it is step two of creating a hackathon, and the person who
 * just filled in the form is not thinking about an admin console.
 */
export function venueSetupPath(event: VenueAddressable): string {
  return `${venuePath(event)}/setup`
}

/**
 * Step two for every type that is not a hackathon (092): the brief, the
 * agenda, the speakers — whichever of those its blueprint asks for.
 *
 * Sits under /events/<slug> rather than /admin for the same reason the venue
 * setup does: the person who just pressed "Create event" is not thinking about
 * an admin console. The same editors are still reachable from there.
 */
export function eventSetupPath(event: Sluggable): string {
  return `/events/${event.slug || event.id}/setup`
}
