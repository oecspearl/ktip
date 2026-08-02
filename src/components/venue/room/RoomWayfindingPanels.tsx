import { Link } from 'react-router'
import { Map as MapIcon, Users } from 'lucide-react'
import { occupancyByRoom } from '../../../lib/venue-presence'
import { venuePath, venueRoomPath } from '../../../lib/event-slug'
import { VENUE_ROOM_KIND_LABELS } from '../../../lib/constants'
import { venueRoomIcon } from '../../../lib/category-icons'
import { colorForRoom, floorBadge, floorLabel } from '../../../lib/venue-map'
import type { VenueMapFloor } from '../../../lib/venue-map'
import { VENUE_AVAILABILITY_LABELS } from '../../../lib/constants'
import { RoomPanel, RoomPanelEmpty, panelScroll, panelShell } from './RoomPanel'
import type { Event, VenueOccupant, VenueRoom } from '../../../types'

/** Which level a room is on. Nothing when the venue only has the one. */
export function floorTag(floor: number, floors: VenueMapFloor[] | undefined): string | null {
  if (!floors || floors.length < 2) return null
  return floorBadge(Math.max(0, Math.trunc(Number(floor) || 0)))
}

/**
 * Where else there is to go.
 *
 * A list rather than a small copy of the walking map: the map is a canvas that
 * wants the whole viewport, and the question this answers — "which rooms have
 * people in them" — is one a sorted list answers better than a picture. The way
 * back to the actual map is the last row.
 *
 * On a venue with more than one level the list is grouped by floor, current
 * floor first. Two rooms called "Team Pod" are otherwise the same row twice,
 * and "which one is upstairs" is exactly the thing somebody reading this list
 * is trying to find out.
 */
export function WayfindingPanel({
  event,
  rooms,
  currentRoomId,
  occupants,
  floors,
  fill,
}: {
  event: Pick<Event, 'id' | 'slug' | 'title'>
  rooms: VenueRoom[] | undefined
  currentRoomId: string
  occupants: VenueOccupant[]
  /** Floors from the event's map config, for the level badges. */
  floors?: VenueMapFloor[]
  fill?: boolean
}) {
  const counts = occupancyByRoom(occupants)
  const all = rooms || []
  const others = all
    .filter((r) => r.id !== currentRoomId && r.kind !== 'team')
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || a.sort_order - b.sort_order)

  const levels = floors || []
  const multiFloor = levels.length > 1
  const currentFloor = Math.max(
    0,
    Math.trunc(Number(all.find((r) => r.id === currentRoomId)?.floor) || 0)
  )

  // Current floor first, then upwards. Somebody who has to change level wants
  // to know that before they click, and everything on this floor is a shorter
  // walk than anything that is not.
  const groups = multiFloor
    ? levels
        .map((floor, index) => ({
          index,
          name: floor.name || floorLabel(index),
          rooms: others.filter((r) => (Number(r.floor) || 0) === index),
        }))
        .filter((g) => g.rooms.length > 0)
        .sort((a, b) => Number(b.index === currentFloor) - Number(a.index === currentFloor) || a.index - b.index)
    : [{ index: 0, name: '', rooms: others }]

  return (
    <RoomPanel title="Elsewhere in the venue" className={panelShell(fill)}>
      {others.length === 0 ? (
        <RoomPanelEmpty>This is the only room.</RoomPanelEmpty>
      ) : (
        <div className={panelScroll(fill, 'max-h-[20rem]')}>
          {groups.map((group) => (
            <div key={group.index}>
              {multiFloor && (
                <p className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-ktip-sand-100 bg-ktip-cream px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ktip-sand-500">
                  <span className="rounded border border-ktip-sand-200 px-1 py-0.5 font-mono text-[9px] text-ktip-sand-500">
                    {floorBadge(group.index)}
                  </span>
                  {group.name}
                  {group.index === currentFloor && (
                    <span className="ml-auto font-normal normal-case text-ktip-sand-400">
                      this floor
                    </span>
                  )}
                </p>
              )}
              <ul className="divide-y divide-ktip-sand-100">
                {group.rooms.map((room) => {
                  const here = counts[room.id] || 0
                  const tag = floorTag(room.floor, levels)
                  // The same glyph the map draws, in the same room colour: a
                  // coloured dot said "this room is green", which is not
                  // something anybody was asking. See VenueRoomList.
                  const Icon = venueRoomIcon(room.kind)
                  return (
                    <li key={room.id}>
                      <Link
                        to={venueRoomPath(event, room.key)}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-ktip-sand-50"
                      >
                        <Icon
                          size={15}
                          className="shrink-0"
                          style={{ color: colorForRoom(room) }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ktip-sand-900">
                            {room.name}
                          </span>
                          <span className="block text-[10px] uppercase tracking-wider text-ktip-sand-400">
                            {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
                            {tag && ` · ${tag}`}
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
            </div>
          ))}
        </div>
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
