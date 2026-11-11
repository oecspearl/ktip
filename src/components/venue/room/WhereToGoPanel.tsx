import { Link } from 'react-router'
import { useLingui } from '@lingui/react/macro'
import { venueRoomPath } from '../../../lib/event-slug'
import { floorLabel, type VenueMapFloor } from '../../../lib/venue-map'
import { RoomPanel } from './RoomPanel'
import type { Event, VenueRoom } from '../../../types'

/**
 * "Where to go": one line per floor, with its first few rooms. The short
 * answer a new arrival needs; the full list of rooms is the map's job.
 */
export function WhereToGoPanel({
  event,
  rooms,
  floors,
}: {
  event: Event
  rooms: VenueRoom[] | undefined
  floors: VenueMapFloor[]
}) {
  const { t } = useLingui()
  const levels = floors.length ? floors : [{ key: 'ground', name: '' }]
  const rows = levels
    .map((floor, index) => {
      const here = (rooms ?? []).filter((r) => (Number(r.floor) || 0) === index).sort((a, b) => a.sort_order - b.sort_order)
      // "Level 1 · Homebases" names the floor after the dot; keep that part.
      const full = floor.name || floorLabel(index)
      const name = full.includes('·') ? full.split('·').slice(1).join('·').trim() : full
      return { index, name, rooms: here }
    })
    .filter((row) => row.rooms.length > 0)

  if (!rows.length) return null

  return (
    <RoomPanel title={t`Where to go`}>
      <ul className="divide-y divide-ktip-sand-100">
        {rows.map((row) => (
          <li key={row.index} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ktip-sand-100 text-xs font-extrabold text-ktip-sand-700">
              {row.index === 0 ? 'G' : row.index}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ktip-sand-900">{row.name}</span>
              <span className="block break-words text-xs text-ktip-sand-500">
                {row.rooms.slice(0, 3).map((room, i) => (
                  <span key={room.id}>
                    {i > 0 && ' · '}
                    <Link to={venueRoomPath(event, room.key)} className="hover:text-ktip-ocean-700 hover:underline">
                      {room.name}
                    </Link>
                  </span>
                ))}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </RoomPanel>
  )
}
