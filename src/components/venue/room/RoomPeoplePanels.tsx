import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { LifeBuoy, Search } from 'lucide-react'
import { useMemberPanel } from '../../../contexts/MemberPanelContext'
import { useVenueRoster } from '../../../hooks/useVenue'
import { venueRoomPath } from '../../../lib/event-slug'
import { AvailabilityDot } from '../AvailabilityDot'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { RoomPanel, RoomPanelEmpty, panelScroll, panelShell } from './RoomPanel'
import { floorTag } from './RoomWayfindingPanels'
import type { VenueMapFloor } from '../../../lib/venue-map'
import type { Event, VenueOccupant, VenueRoom } from '../../../types'

/** Skill chips offered before the panel becomes a tag cloud. */
const TOP_SKILLS = 10

/**
 * Find someone by what they can do.
 *
 * event_venue_members.skills has existed since 070 and nothing has ever read
 * it. The chips are the skills actually present at this event, commonest first
 * — an invented taxonomy would be wrong within one hackathon, and this one
 * cannot be.
 */
export function SkillFinderPanel({
  eventId,
  occupants,
  fill,
}: {
  eventId: string
  occupants: VenueOccupant[]
  fill?: boolean
}) {
  const { openMember } = useMemberPanel()
  const { roster, loading } = useVenueRoster(eventId)
  const [query, setQuery] = useState('')

  const live = useMemo(() => new Map(occupants.map((o) => [o.user_id, o])), [occupants])

  const skills = useMemo(() => {
    const counts = new Map<string, number>()
    for (const member of roster || []) {
      for (const skill of member.skills || []) {
        const key = skill.trim()
        if (key) counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_SKILLS)
      .map(([skill]) => skill)
  }, [roster])

  const needle = query.trim().toLowerCase()
  const matches = (roster || []).filter((member) => {
    if (!needle) return false
    const name = (live.get(member.user_id)?.display_name || member.user?.display_name || '').toLowerCase()
    return (
      name.includes(needle) ||
      (member.skills || []).some((s) => s.toLowerCase().includes(needle))
    )
  })

  return (
    <RoomPanel title="Find someone" className={panelShell(fill)}>
      <div className="p-3">
        <label className="relative block">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ktip-sand-400"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A skill, or a name"
            aria-label="Search people at this event by skill or name"
            className="w-full rounded-xl border border-ktip-sand-200 py-1.5 pl-8 pr-2 text-sm"
          />
        </label>

        {!needle && skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {skills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => setQuery(skill)}
                className="rounded-full border border-ktip-sand-200 bg-ktip-sand-50 px-2 py-0.5 text-[11px] text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700"
              >
                {skill}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="px-4 pb-4">
          <div className="h-3 w-2/3 rounded bg-ktip-sand-100 animate-pulse-soft" />
        </div>
      ) : !needle ? (
        <RoomPanelEmpty>
          {skills.length ? 'Pick a skill, or type a name.' : 'Nobody here has listed a skill yet.'}
        </RoomPanelEmpty>
      ) : matches.length === 0 ? (
        <RoomPanelEmpty>Nobody matches “{query.trim()}”.</RoomPanelEmpty>
      ) : (
        <ul
          className={`divide-y divide-ktip-sand-100 border-t border-ktip-sand-100 ${panelScroll(fill, 'max-h-[20rem]')}`}
        >
          {matches.slice(0, 20).map((member) => {
            const presence = live.get(member.user_id)
            const name = presence?.display_name || member.user?.display_name || 'Member'
            return (
              <li key={member.user_id} className="flex items-center gap-3 px-4 py-2">
                <DiamondAvatar
                  src={presence?.avatar_url ?? member.user?.avatar_url ?? null}
                  name={name}
                  size={28}
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openMember(member.user_id)}
                    className="block max-w-full truncate text-sm text-ktip-sand-900 hover:text-ktip-ocean-600 hover:underline"
                  >
                    {name}
                  </button>
                  <AvailabilityDot
                    availability={presence?.availability ?? member.availability}
                    size="sm"
                    withLabel
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </RoomPanel>
  )
}

/**
 * Who is stuck, right now.
 *
 * 'help_wanted' has been a colour on a dot since 070 and nothing has ever acted
 * on it. This is the whole point of setting it: a mentor sees the list and goes
 * to the room, which is why each row links there rather than opening a chat.
 */
export function HelpNudgePanel({
  occupants,
  event,
  rooms,
  floors,
  fill,
}: {
  occupants: VenueOccupant[]
  event: Pick<Event, 'id' | 'slug' | 'title'>
  rooms: VenueRoom[] | undefined
  floors?: VenueMapFloor[]
  fill?: boolean
}) {
  const { openMember } = useMemberPanel()
  const roomsById = useMemo(() => new Map((rooms || []).map((r) => [r.id, r])), [rooms])
  const stuck = occupants.filter((o) => o.availability === 'help_wanted')

  return (
    <RoomPanel title="Needs help" meta={stuck.length || undefined} className={panelShell(fill)}>
      {stuck.length === 0 ? (
        <RoomPanelEmpty>Nobody has asked for help.</RoomPanelEmpty>
      ) : (
        <ul className={`divide-y divide-ktip-sand-100 ${panelScroll(fill, 'max-h-[24rem]')}`}>
          {stuck.map((person) => {
            const name = person.display_name || 'Member'
            const room = person.room_id ? roomsById.get(person.room_id) : undefined
            return (
              <li key={person.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <LifeBuoy size={15} className="shrink-0 text-ktip-sun-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openMember(person.user_id)}
                    className="block max-w-full truncate text-sm font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 hover:underline"
                  >
                    {name}
                  </button>
                  {person.status_note && (
                    <span className="block truncate text-xs italic text-ktip-sand-500">
                      “{person.status_note}”
                    </span>
                  )}
                  {/* Where they are, not only that they are stuck: a mentor
                      deciding whether to walk needs the room and the level. */}
                  {room && (
                    <span className="block truncate text-[10px] uppercase tracking-wider text-ktip-sand-400">
                      {room.name}
                      {floorTag(room.floor, floors) && ` · ${floorTag(room.floor, floors)}`}
                    </span>
                  )}
                </div>
                {room && (
                  <Link
                    to={venueRoomPath(event, room.key)}
                    className="shrink-0 rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-2 py-1 text-[10px] font-semibold text-ktip-sun-800 hover:border-ktip-sun-400"
                  >
                    Go
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
