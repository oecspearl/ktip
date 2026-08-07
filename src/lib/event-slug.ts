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
 * The event management console, optionally opened on one tab and in setup
 * mode.
 *
 * Setting an event up used to be two pages of its own (089, 092) that mounted
 * the console's editors a second time. It is now the console itself with a
 * stepper over the tab strip, so there is one address for "work on this
 * event" and the host never crosses a seam between building it and running it.
 */
export function eventManagePath(
  event: Sluggable,
  opts: { tab?: string; setup?: boolean } = {}
): string {
  const query = new URLSearchParams()
  if (opts.tab) query.set('tab', opts.tab)
  if (opts.setup) query.set('setup', '1')
  const suffix = query.toString()
  return `/events/${event.slug || event.id}/manage${suffix ? `?${suffix}` : ''}`
}
