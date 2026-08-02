import { useState } from 'react'
import { ChevronRight, Lock, Users } from 'lucide-react'
import { colorForRoom, floorBadge, type VenueMapConfig } from '../../../lib/venue-map'
import { venueRoomIcon } from '../../../lib/category-icons'
import { VENUE_ROOM_KIND_LABELS } from '../../../lib/constants'
import type { VenueRoom } from '../../../types'

interface VenueRoomListProps {
  config: VenueMapConfig
  rooms: VenueRoom[]
  occupancy: Record<string, number>
  /** Room currently underfoot, highlighted so the list and map agree. */
  activeRoomId?: string | null
  lockedIds?: Set<string>
  /** Drops the card chrome, for when this is a rail inside the map itself. */
  bare?: boolean
  onPick: (room: VenueRoom) => void
  /**
   * Room under the cursor, or focused by keyboard. Picking one walks you in, so
   * this is how a room can be read without being committed to.
   */
  onHover?: (room: VenueRoom | null) => void
}

/**
 * Every room in the building, by floor.
 *
 * The map answers "what is around me"; this answers "what exists at all",
 * which is the question someone has when the room they want is on another
 * level or behind a wall. Picking one walks you there — it is the same action
 * as clicking the room on the map, not a second way of doing things.
 */
export function VenueRoomList({
  config,
  rooms,
  occupancy,
  activeRoomId,
  lockedIds,
  bare = false,
  onPick,
  onHover,
}: VenueRoomListProps) {
  // Floors other than the ground one start collapsed: a six-room venue should
  // not push the presence list off the screen.
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const byFloor = config.floors.map((floor, index) => ({
    floor,
    index,
    rooms: rooms
      .filter((r) => (Number(r.floor) || 0) === index)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  }))

  return (
    <div className={bare ? '' : 'rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-3 shadow-card'}>
      {!bare && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">Rooms</h2>
          <span className="ml-auto font-mono text-[10px] text-ktip-sand-400">{rooms.length}</span>
        </div>
      )}

      <div className="space-y-2">
        {byFloor.map(({ floor, index, rooms: floorRooms }) => {
          const open = !collapsed[index]
          return (
            <div key={floor.key}>
              {config.floors.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [index]: open }))}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-ktip-sand-700 hover:bg-ktip-sand-50"
                >
                  <span className="rounded border border-ktip-sand-200 px-1.5 py-0.5 font-mono text-[9px] text-ktip-sand-500">
                    {floorBadge(index)}
                  </span>
                  {floor.name}
                  <span className="font-mono text-[10px] text-ktip-sand-400">{floorRooms.length}</span>
                  <ChevronRight
                    size={13}
                    className={`ml-auto text-ktip-sand-400 transition-transform ${open ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              )}

              {open && (
                <ul className="mt-1 space-y-1">
                  {floorRooms.length === 0 && (
                    <li className="px-2 py-1 text-[11px] text-ktip-sand-400">Nothing on this floor</li>
                  )}
                  {floorRooms.map((room) => {
                    const color = colorForRoom(room)
                    const here = occupancy[room.id] || 0
                    const locked = lockedIds?.has(room.id)
                    const active = room.id === activeRoomId
                    const Icon = venueRoomIcon(room.kind)
                    return (
                      <li key={room.id}>
                        {/*
                          A grid, not a flex row with a hand-tuned indent: the
                          name and the line under it share column two, so they
                          stay flush whatever the icon's width turns out to be.
                        */}
                        <button
                          type="button"
                          onClick={() => onPick(room)}
                          // Reading a room and entering it are different acts.
                          // Pointing at the row (or tabbing to it) shows what is
                          // in there; only the click walks you in.
                          onMouseEnter={() => onHover?.(room)}
                          onMouseLeave={() => onHover?.(null)}
                          onFocus={() => onHover?.(room)}
                          onBlur={() => onHover?.(null)}
                          className={`grid w-full grid-cols-[1.1rem_1fr_auto] items-center gap-x-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                            active
                              ? 'bg-ktip-sand-50'
                              : 'border-ktip-sand-100 hover:border-ktip-sand-300 hover:bg-ktip-sand-50'
                          }`}
                          style={active ? { borderColor: color } : undefined}
                        >
                          <Icon size={14} style={{ color }} aria-hidden="true" />
                          <span
                            className={`flex min-w-0 items-center gap-1 text-xs font-semibold ${
                              locked ? 'text-ktip-sand-500' : 'text-ktip-sand-900'
                            }`}
                          >
                            <span className="truncate">{room.name}</span>
                            {locked && (
                              <Lock size={11} className="shrink-0 text-ktip-sand-400" aria-hidden="true" />
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-0.5 font-mono text-[10px] text-ktip-sand-500">
                            <Users size={9} aria-hidden="true" />
                            {here}
                          </span>

                          <span className="col-start-2 col-end-4 mt-0.5 truncate text-[10px] text-ktip-sand-500">
                            {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
                            {room.capacity != null ? ` · cap ${room.capacity}` : ''}
                            {!room.is_open ? ' · closed' : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
