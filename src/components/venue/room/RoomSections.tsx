import { useMemo } from 'react'
import { useEventCriteria } from '../../../hooks/useEventCriteria'
import { sectionsForRoom, sectionsInSlot } from '../../../lib/venue-room-sections'
import type { ResolvedRoomSection, RoomSectionSlot } from '../../../lib/venue-room-sections'
import { EventChallengeBrief } from '../../events/EventChallengeBrief'
import { EventSolutionsPanel } from '../../events/EventSolutionsPanel'
import { RoomChatPanel } from '../RoomChatPanel'
import { RoomOccupantList } from '../RoomOccupantList'
import { AvComingSoon } from './AvComingSoon'
import { FocusTimerPanel } from './FocusTimerPanel'
import { LookingForTeamPanel } from './LookingForTeamPanel'
import { RoleRosterPanel } from './RoleRosterPanel'
import { RoomAnnouncements } from './RoomAnnouncements'
import { CheckInCard, OnboardingChecklist } from './RoomArrivalPanels'
import { RoomFaqPanel, RoomResourcesPanel, RoomTextSection } from './RoomContentPanels'
import { ActivityLogPanel, HostControlsPanel } from './RoomOpsPanels'
import { HelpNudgePanel, SkillFinderPanel } from './RoomPeoplePanels'
import { HandQueuePanel, ReactionsBar } from './RoomSignalPanels'
import {
  CapacityNotice,
  VenueHeadcountPanel,
  WayfindingPanel,
} from './RoomWayfindingPanels'
import { RoomCountdown } from './RoomCountdown'
import { SponsorHero } from './SponsorHero'
import { SponsorLinksPanel } from './SponsorLinksPanel'
import type { useRoomSignals } from '../../../hooks/useRoomSignals'
import type {
  Event,
  EventVenueMember,
  VenueOccupant,
  VenueRole,
  VenueRoom,
} from '../../../types'

/**
 * Everything one section needs, gathered once by the page.
 *
 * Passed as a bundle rather than fetched per section because the expensive
 * things — presence, the roster, the room list — are already on the page and a
 * section that re-fetched them would be a second subscription for the same
 * data.
 */
export interface RoomSectionContext {
  event: Event
  room: VenueRoom
  rooms: VenueRoom[] | undefined
  /** Everyone in the venue, live presence merged over the cold roster. */
  occupants: VenueOccupant[]
  /** Everyone in *this* room. */
  inRoom: VenueOccupant[]
  viewerRole: VenueRole
  isHost: boolean
  membership: EventVenueMember
  /**
   * Reactions and raised hands, subscribed once by the page.
   *
   * Held here rather than inside the two panels that use it because the main
   * and aside columns are separate component trees — a hook in each would open
   * the same room channel twice and double every event.
   */
  signals: ReturnType<typeof useRoomSignals>
}

/**
 * The room, assembled.
 *
 * Which panels appear is data (venue_rooms.sections, or the kind's defaults) —
 * see src/lib/venue-room-sections.ts. This file is only the map from an id to a
 * component, and it is the one place that has to change when a section is added.
 *
 * Sections that have nothing to show render null and disappear rather than
 * printing an empty card: a sponsor banner on a room with no sponsor, or a
 * challenge brief on an event with no brief, is noise the host did not choose.
 */
export function RoomSections({
  slot,
  context,
  className,
}: {
  slot: RoomSectionSlot
  context: RoomSectionContext
  className?: string
}) {
  const { room, viewerRole } = context
  const resolved = useMemo(() => sectionsForRoom(room, viewerRole), [room, viewerRole])
  const sections = sectionsInSlot(resolved, slot)
  if (!sections.length) return null

  return (
    <div className={className}>
      {sections.map((section) => (
        <RoomSection key={section.def.id} section={section} context={context} />
      ))}
    </div>
  )
}

function RoomSection({
  section,
  context,
}: {
  section: ResolvedRoomSection
  context: RoomSectionContext
}) {
  const { event, room, rooms, occupants, inRoom, viewerRole, isHost, membership, signals } =
    context
  const canPost = viewerRole !== 'spectator' && room.is_open

  switch (section.def.id) {
    case 'sponsor_hero':
      return <SponsorHero room={room} />

    case 'check_in':
      return <CheckInCard event={event} />

    case 'host_controls':
      return <HostControlsPanel room={room} />

    case 'av_placeholder':
      return <AvComingSoon room={room} />

    case 'reactions':
      return <ReactionsBar signals={signals} />

    case 'focus_timer':
      return <FocusTimerPanel />

    case 'objectives':
      return <RoomTextSection variant="objectives" config={section.config} room={room} />

    case 'rules':
      return <RoomTextSection variant="rules" config={section.config} room={room} />

    case 'resources':
      return <RoomResourcesPanel event={event} isHost={isHost} />

    case 'faq':
      return <RoomFaqPanel eventId={event.id} />

    case 'challenge_brief':
      return <ChallengeBriefSection event={event} />

    case 'showcase_gallery':
      return (
        <EventSolutionsPanel
          eventId={event.id}
          eventStatus={event.status}
          submissionDeadline={event.submission_deadline ?? null}
          isOrganizer={isHost}
        />
      )

    case 'chat':
      return (
        <div data-tutorial="room-chat">
          <RoomChatPanel
            room={room}
            canPost={canPost}
            canModerate={isHost}
            className="h-[32rem]"
          />
        </div>
      )

    // The same panel with posting closed to everyone but the host. A separate
    // id rather than a flag on `chat` so the host's picker offers the two as
    // the choice they actually are.
    case 'announcement_feed':
      return (
        <RoomChatPanel
          room={room}
          canPost={isHost && room.is_open}
          canModerate={isHost}
          className="h-[24rem]"
        />
      )

    case 'occupants':
      return (
        <div data-tutorial="room-presence">
          <RoomOccupantList
            occupants={inRoom}
            title="In this room"
            emptyLabel="You are the first one here."
          />
        </div>
      )

    case 'hand_queue':
      return <HandQueuePanel signals={signals} />

    case 'looking_for_team':
      return <LookingForTeamPanel eventId={event.id} occupants={occupants} />

    case 'skill_finder':
      return <SkillFinderPanel eventId={event.id} occupants={occupants} />

    case 'help_nudge':
      return <HelpNudgePanel occupants={occupants} event={event} rooms={rooms} />

    case 'mentors_on_duty':
      return (
        <RoleRosterPanel
          occupants={occupants}
          role="mentor"
          title="Mentors on duty"
          emptyLabel="No mentors in the venue yet."
          event={event}
          rooms={rooms}
        />
      )

    case 'judges_present':
      return (
        <RoleRosterPanel
          occupants={occupants}
          role="judge"
          title="Judges"
          emptyLabel="No judges in the venue yet."
          event={event}
          rooms={rooms}
        />
      )

    case 'countdown':
      return <RoomCountdown deadline={event.submission_deadline} />

    case 'announcements':
      return <RoomAnnouncements eventId={event.id} />

    case 'capacity':
      return <CapacityNotice room={room} inRoom={inRoom} />

    case 'activity_log':
      return <ActivityLogPanel roomId={room.id} />

    case 'sponsor_links':
      return <SponsorLinksPanel config={section.config} sponsorName={room.sponsor_name} />

    case 'onboarding':
      return <OnboardingChecklist event={event} membership={membership} />

    case 'wayfinding':
      return (
        <WayfindingPanel
          event={event}
          rooms={rooms}
          currentRoomId={room.id}
          occupants={occupants}
        />
      )

    case 'venue_headcount':
      return <VenueHeadcountPanel occupants={occupants} />

    default:
      return null
  }
}

/**
 * The brief is the one reused component that needs its own query, and it
 * already returns null when the event has no criteria — so the fetch is kept
 * here rather than in the page's context bundle, where it would run for every
 * room whether or not the brief is switched on.
 */
function ChallengeBriefSection({ event }: { event: Event }) {
  const { criteria } = useEventCriteria(event.id)
  if (!criteria?.length) return null
  return (
    <EventChallengeBrief
      criteria={criteria}
      submissionDeadline={event.submission_deadline ?? null}
    />
  )
}
