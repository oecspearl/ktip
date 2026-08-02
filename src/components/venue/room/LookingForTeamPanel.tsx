import { MessageSquare } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useMemberPanel } from '../../../contexts/MemberPanelContext'
import { useMessagingPanel } from '../../../contexts/MessagingPanelContext'
import { useVenueDiscoverable } from '../../../hooks/useVenue'
import { canDirectMessage } from '../../../lib/venue-actions'
import { AvailabilityDot } from '../AvailabilityDot'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { RoomPanel, RoomPanelEmpty, panelScroll, panelShell } from './RoomPanel'
import type { VenueAvailability, VenueOccupant } from '../../../types'

/** Skills before the row would start wrapping into a paragraph. */
const SKILL_CAP = 4

/**
 * Participants who ticked "looking for a team", venue-wide.
 *
 * Venue-wide and not room-scoped on purpose: someone who needs a team is not
 * helped by a list of the people already standing next to them. The filter
 * (discoverable AND looking AND participant) lives in useVenueDiscoverable and
 * is shared with anything else that asks the same question.
 *
 * Availability comes from live presence where there is any, and from the
 * roster's cold mirror otherwise — the same precedence the occupant lists use,
 * so one person cannot appear "Working" here and "Offline" three panels down.
 */
export function LookingForTeamPanel({
  eventId,
  occupants,
  fill,
}: {
  eventId: string
  occupants: VenueOccupant[]
  fill?: boolean
}) {
  const auth = useAuth()
  const { openMember } = useMemberPanel()
  const { openPanel } = useMessagingPanel()
  const { discoverable, loading } = useVenueDiscoverable(eventId)

  const live = new Map(occupants.map((o) => [o.user_id, o]))
  const canInitiateDm = auth.can('dm:initiate')

  const people = (discoverable || []).map((member) => {
    const presence = live.get(member.user_id)
    return {
      member,
      availability: (presence?.availability ?? member.availability) as VenueAvailability,
      isLive: presence?.is_live ?? false,
      name: presence?.display_name || member.user?.display_name || 'Member',
      avatar: presence?.avatar_url ?? member.user?.avatar_url ?? null,
    }
  })

  return (
    <RoomPanel
      title="Looking for a team"
      meta={people.length || undefined}
      className={panelShell(fill)}
    >
      {loading ? (
        <div className="space-y-2 p-4">
          <div className="h-3 w-2/3 rounded bg-ktip-sand-100 animate-pulse-soft" />
          <div className="h-3 w-1/2 rounded bg-ktip-sand-100 animate-pulse-soft" />
        </div>
      ) : people.length === 0 ? (
        <RoomPanelEmpty>
          Nobody is looking right now. Tick “looking for a team” on your own venue profile to appear
          here.
        </RoomPanelEmpty>
      ) : (
        <ul className={`divide-y divide-ktip-sand-100 ${panelScroll(fill, 'max-h-[24rem]')}`}>
          {people.map(({ member, availability, isLive, name, avatar }) => {
            const isSelf = member.user_id === auth.user?.id
            const skills = (member.skills || []).slice(0, SKILL_CAP)
            const showDm = canDirectMessage({
              canInitiateDm,
              isSelf,
              targetRole: member.role,
              targetIsLive: isLive,
            })

            return (
              <li key={member.user_id} className="flex items-start gap-3 px-4 py-2.5">
                <DiamondAvatar src={avatar} name={name} size={32} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openMember(member.user_id)}
                      className="truncate text-sm font-medium text-ktip-sand-900 hover:text-ktip-ocean-600 hover:underline"
                    >
                      {name}
                    </button>
                    {isSelf && <span className="text-[10px] text-ktip-sand-400">(you)</span>}
                  </div>
                  <AvailabilityDot availability={availability} size="sm" withLabel />
                  {skills.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-ktip-sand-200 bg-ktip-sand-50 px-1.5 py-0.5 text-[10px] text-ktip-sand-600"
                        >
                          {skill}
                        </span>
                      ))}
                      {(member.skills?.length || 0) > SKILL_CAP && (
                        <span className="text-[10px] text-ktip-sand-400">
                          +{(member.skills as string[]).length - SKILL_CAP}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {showDm && (
                  <button
                    type="button"
                    onClick={() => openPanel({ userId: member.user_id })}
                    aria-label={`Message ${name}`}
                    title="Message"
                    className="shrink-0 rounded-lg p-1.5 text-ktip-sand-500 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-ocean-600"
                  >
                    <MessageSquare size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </RoomPanel>
  )
}
