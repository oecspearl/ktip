import { Link } from 'react-router'
import { useMemberPanel } from '../../../contexts/MemberPanelContext'
import { sortOccupants } from '../../../lib/venue-presence'
import { venueRoomPath } from '../../../lib/event-slug'
import { AvailabilityDot } from '../AvailabilityDot'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { RoomPanel, RoomPanelEmpty, panelScroll, panelShell } from './RoomPanel'
import { floorTag } from './RoomWayfindingPanels'
import type { VenueMapFloor } from '../../../lib/venue-map'
import type { Event, VenueOccupant, VenueRole, VenueRoom } from '../../../types'
import { useLingui } from '@lingui/react/macro'

interface RoleRosterPanelProps {
  occupants: VenueOccupant[]
  role: VenueRole
  title: string
  emptyLabel: string
  event: Pick<Event, 'id' | 'slug' | 'title'>
  rooms: VenueRoom[] | undefined
  /** Floors from the map config, so the room chip can say which level. */
  floors?: VenueMapFloor[]
  fill?: boolean
}

/**
 * Everyone holding one venue role, wherever they are standing.
 *
 * Venue-wide rather than room-scoped because the question this answers is "is
 * anyone who can help me around", and the answer is no less useful when they
 * are one room over — so each row says which room, and links to it.
 *
 * sortOccupants puts help_wanted and working above away, busy and offline, so
 * the free mentor is the first row rather than the alphabetically luckiest one.
 */
export function RoleRosterPanel({
  occupants,
  role,
  title,
  emptyLabel,
  event,
  rooms,
  floors,
  fill,
}: RoleRosterPanelProps) {
  const { t } = useLingui()
  const { openMember } = useMemberPanel()

  const people = sortOccupants(occupants.filter((o) => o.role === role))
  const available = people.filter((o) => o.availability !== 'offline').length
  const roomsById = new Map((rooms || []).map((r) => [r.id, r]))

  return (
    <RoomPanel
      title={title}
      meta={people.length ? `${available}/${people.length}` : undefined}
      className={panelShell(fill)}
    >
      {people.length === 0 ? (
        <RoomPanelEmpty>{emptyLabel}</RoomPanelEmpty>
      ) : (
        <ul className={`divide-y divide-ktip-sand-100 ${panelScroll(fill, 'max-h-[24rem]')}`}>
          {people.map((person) => {
            const name = person.display_name || t`Member`
            const room = person.room_id ? roomsById.get(person.room_id) : undefined

            return (
              <li key={person.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <DiamondAvatar src={person.avatar_url} name={name} size={32} />

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openMember(person.user_id)}
                    className="block max-w-full truncate text-sm font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 hover:underline"
                  >
                    {name}
                  </button>
                  <AvailabilityDot availability={person.availability} size="sm" withLabel />
                  {person.status_note && (
                    <span className="block truncate text-xs italic text-ktip-sand-500">
                      “{person.status_note}”
                    </span>
                  )}
                </div>

                {room && (
                  <Link
                    to={venueRoomPath(event, room.key)}
                    className="flex shrink-0 items-center gap-1 truncate rounded-lg border border-ktip-sand-200 px-2 py-1 text-[10px] font-medium text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700"
                    title={t`Go to ${room.name}`}
                  >
                    <span className="truncate">{room.name}</span>
                    {/* Which level, when there is more than one — "the mentor is
                        two rooms over" and "the mentor is upstairs" are
                        different answers to the same question. */}
                    {floorTag(room.floor, floors) && (
                      <span className="shrink-0 font-mono text-[9px] text-ktip-sand-400">
                        {floorTag(room.floor, floors)}
                      </span>
                    )}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </RoomPanel>
  )
}
