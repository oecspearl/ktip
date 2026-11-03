import { useState } from 'react'
import { ChevronRight, Lock, Users } from 'lucide-react'
import { colorForRoom, floorBadge, type VenueMapConfig } from '../../../lib/venue-map'
import { venueRoomIcon } from '../../../lib/category-icons'
import { VENUE_ROOM_KIND_LABELS } from '../../../lib/constants'
import type { VenueRoom } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface VenueRoomListProps {
  config: VenueMapConfig
  rooms: VenueRoom[]
  occupancy: Record<string, number>
  /** Room currently underfoot, highlighted so the list and map agree. */
  activeRoomId?: string | null
  /**
   * The level being stood on. Its group is the one open; every other level is
   * folded away, and a floor change moves the open group with it.
   */
  currentFloor?: number
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
 *
 * Laid out as a tree: each floor is a header, its rooms hang off a guide line
 * under it. Only one floor is open at a time, and it follows the floor you are
 * on, so the list never shows a level you are not looking at unless you ask.
 */
export function VenueRoomList({
  config,
  rooms,
  occupancy,
  activeRoomId,
  currentFloor = 0,
  lockedIds,
  bare = false,
  onPick,
  onHover,
}: VenueRoomListProps) {
  const { t } = useLingui()
  // The open group. null is "all folded", which a click on the open header
  // gives you. Clicking another header peeks at that floor instead.
  const [openFloor, setOpenFloor] = useState<number | null>(currentFloor)
  // Re-synced during render rather than in an effect, so a floor change never
  // paints one frame with the old level still open.
  const [syncedFloor, setSyncedFloor] = useState(currentFloor)
  if (syncedFloor !== currentFloor) {
    setSyncedFloor(currentFloor)
    setOpenFloor(currentFloor)
  }

  const multiFloor = config.floors.length > 1

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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500"><Trans>Rooms</Trans></h2>
          <span className="ml-auto font-mono text-[10px] text-ktip-sand-400">{rooms.length}</span>
        </div>
      )}

      <div className="space-y-1">
        {byFloor.map(({ floor, index, rooms: floorRooms }) => {
          const open = !multiFloor || openFloor === index
          const here = index === currentFloor
          const groupId = `venue-floor-${floor.key}`
          return (
            <div key={floor.key}>
              {multiFloor && (
                <button
                  type="button"
                  onClick={() => setOpenFloor(open ? null : index)}
                  aria-expanded={open}
                  aria-controls={groupId}
                  className="flex w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-ktip-sand-50"
                >
                  {/* The floor you are on gets a filled badge, the rest an
                      outline: the same "you are here" the floor chips show. */}
                  <span
                    className={`mt-px shrink-0 rounded border px-1 py-0.5 font-mono text-[9px] font-semibold leading-none ${
                      here
                        ? 'border-ktip-ocean-600 bg-ktip-ocean-600 text-white'
                        : 'border-ktip-sand-300 text-ktip-sand-600'
                    }`}
                  >
                    {floorBadge(index)}
                  </span>
                  <span className="min-w-0 flex-1 text-xs font-bold leading-snug text-ktip-sand-900">
                    {floor.name}
                  </span>
                  <span className="mt-px shrink-0 font-mono text-[10px] text-ktip-sand-500">
                    {floorRooms.length}
                  </span>
                  <ChevronRight
                    size={13}
                    className={`mt-px shrink-0 text-ktip-sand-500 transition-transform ${open ? 'rotate-90' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              )}

              {open && (
                <ul
                  id={groupId}
                  // The guide line runs down from under the floor badge, so the
                  // rooms read as that floor's children.
                  className={
                    multiFloor
                      ? 'mb-1 ml-[0.8rem] mt-0.5 space-y-0.5 border-l border-ktip-sand-300 pl-1.5'
                      : 'space-y-0.5'
                  }
                >
                  {floorRooms.length === 0 && (
                    <li className="px-2 py-1 text-[11px] text-ktip-sand-500"><Trans>Nothing on this floor</Trans></li>
                  )}
                  {floorRooms.map((room) => {
                    const color = colorForRoom(room)
                    const count = occupancy[room.id] || 0
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
                          aria-current={active ? 'location' : undefined}
                          className={`grid w-full grid-cols-[1rem_1fr_auto] items-center gap-x-1.5 rounded-lg border px-1.5 py-1 text-left transition-colors ${
                            active
                              ? 'bg-ktip-sand-50'
                              : 'border-transparent hover:border-ktip-sand-200 hover:bg-ktip-sand-50'
                          }`}
                          style={active ? { borderColor: color } : undefined}
                        >
                          <Icon size={13} style={{ color }} aria-hidden="true" />
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
                            {count}
                          </span>

                          <span className="col-start-2 col-end-4 truncate text-[10px] leading-tight text-ktip-sand-500">
                            {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
                            {room.capacity != null ? t` · cap ${room.capacity}` : ''}
                            {!room.is_open ? t` · closed` : ''}
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
