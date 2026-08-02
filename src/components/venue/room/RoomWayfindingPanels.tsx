import { Link } from 'react-router'
import { Map as MapIcon, Users } from 'lucide-react'
import { occupancyByRoom } from '../../../lib/venue-presence'
import { venuePath, venueRoomPath } from '../../../lib/event-slug'
import { VENUE_ROOM_KIND_LABELS } from '../../../lib/constants'
import { colorForRoom } from '../../../lib/venue-map'
import { VENUE_AVAILABILITY_LABELS } from '../../../lib/constants'
import { RoomPanel, RoomPanelEmpty } from './RoomPanel'
import type { Event, VenueOccupant, VenueRoom } from '../../../types'

/**
 * Where else there is to go.
 *
 * A list rather than a small copy of the walking map: the map is a canvas that
 * wants the whole viewport, and the question this answers — "which rooms have
 * people in them" — is one a sorted list answers better than a picture. The way
 * back to the actual map is the last row.
 */
export function WayfindingPanel({
  event,
  rooms,
  currentRoomId,
  occupants,
}: {
  event: Pick<Event, 'id' | 'slug' | 'title'>
  rooms: VenueRoom[] | undefined
  currentRoomId: string
  occupants: VenueOccupant[]
}) {
  const counts = occupancyByRoom(occupants)
  const others = (rooms || [])
    .filter((r) => r.id !== currentRoomId && r.kind !== 'team')
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || a.sort_order - b.sort_order)

  return (
    <RoomPanel title="Elsewhere in the venue">
      {others.length === 0 ? (
        <RoomPanelEmpty>This is the only room.</RoomPanelEmpty>
      ) : (
        <ul className="max-h-[20rem] divide-y divide-ktip-sand-100 overflow-y-auto">
          {others.map((room) => {
            const here = counts[room.id] || 0
            return (
              <li key={room.id}>
                <Link
                  to={venueRoomPath(event, room.key)}
                  className="flex items-center gap-2.5 px-4 py-2 hover:bg-ktip-sand-50"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: colorForRoom(room) }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ktip-sand-900">{room.name}</span>
                    <span className="block text-[10px] uppercase tracking-wider text-ktip-sand-400">
                      {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
                      {!room.is_open && ' · closed'}
                    </span>
                  </span>
                  {here > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-ktip-sand-500">
                      <Users size={12} aria-hidden="true" />
                      {here}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link
        to={venuePath(event)}
        className="flex items-center justify-center gap-1.5 border-t border-ktip-sand-100 px-4 py-2 text-xs font-semibold text-ktip-ocean-600 hover:bg-ktip-sand-50"
      >
        <MapIcon size={13} aria-hidden="true" />
        Open the map
      </Link>
    </RoomPanel>
  )
}

/** The four statuses worth counting. 'offline' is the absence of a count. */
const COUNTED = ['working', 'help_wanted', 'busy', 'away'] as const

/**
 * How busy the whole venue is.
 *
 * Venue-wide because the number that matters to somebody standing in an empty
 * room is how many people are anywhere at all — an empty workshop during a
 * packed keynote means something different from an empty workshop at 3am.
 */
export function VenueHeadcountPanel({ occupants }: { occupants: VenueOccupant[] }) {
  const present = occupants.filter((o) => o.availability !== 'offline')
  const counts = COUNTED.map((availability) => ({
    availability,
    n: present.filter((o) => o.availability === availability).length,
  })).filter((row) => row.n > 0)

  const inRooms = present.filter((o) => o.room_id).length

  return (
    <RoomPanel title="In the venue" meta={present.length}>
      {present.length === 0 ? (
        <RoomPanelEmpty>Nobody is here yet.</RoomPanelEmpty>
      ) : (
        <div className="space-y-1.5 px-4 py-3">
          {counts.map(({ availability, n }) => (
            <p key={availability} className="flex items-baseline justify-between text-sm">
              <span className="text-ktip-sand-600">{VENUE_AVAILABILITY_LABELS[availability]}</span>
              <span className="font-mono text-ktip-sand-900">{n}</span>
            </p>
          ))}
          <p className="flex items-baseline justify-between border-t border-ktip-sand-100 pt-1.5 text-sm">
            <span className="text-ktip-sand-600">In a room</span>
            <span className="font-mono text-ktip-sand-900">
              {inRooms}/{present.length}
            </span>
          </p>
        </div>
      )}
    </RoomPanel>
  )
}

/**
 * How full this room is.
 *
 * Renders nothing when the room has no capacity, which is most of them —
 * "unlimited" is not news. enter_venue_room() is what actually turns people
 * away; this only makes the limit visible before they hit it.
 */
export function CapacityNotice({
  room,
  inRoom,
}: {
  room: VenueRoom
  inRoom: VenueOccupant[]
}) {
  if (!room.capacity) return null

  const here = inRoom.length
  const pct = Math.min(100, Math.round((here / room.capacity) * 100))
  const full = here >= room.capacity

  return (
    <RoomPanel title="Capacity" meta={`${here}/${room.capacity}`}>
      <div className="px-4 py-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-ktip-sand-100">
          <div
            className={`h-full rounded-full ${full ? 'bg-red-500' : 'bg-ktip-tropical-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ktip-sand-500">
          {full
            ? 'This room is full. Nobody else can enter until someone leaves.'
            : `Room for ${room.capacity - here} more.`}
        </p>
      </div>
    </RoomPanel>
  )
}
