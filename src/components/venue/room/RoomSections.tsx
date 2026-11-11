import { useCallback, useMemo, useState } from 'react'
import { Info, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { isVenueVideoConfigured } from '../../../hooks/useVenueRoomToken'
import { sectionsForRoom } from '../../../lib/venue-room-sections'
import type { ResolvedRoomSection, RoomSectionId } from '../../../lib/venue-room-sections'
import { cameraModeFor, orderSectionIds } from '../../../lib/venue-room-layout'
import { planRoomShell } from '../../../lib/venue-room-shell'
import { parseBoardAgenda } from '../../../lib/call-board'
import { RoomDock, type DockTab } from './RoomDock'
import { EventSolutionsPanel } from '../../events/EventSolutionsPanel'
import { RoomChatPanel } from '../RoomChatPanel'
import { RoomOccupantList } from '../RoomOccupantList'
import { AvStage } from './AvStage'
import type { CallSharer } from './VenueCall'
import { FocusTimerPanel } from './FocusTimerPanel'
import { CaptionTestPanel } from './CaptionTestPanel'
import { LookingForTeamPanel } from './LookingForTeamPanel'
import { RoleRosterPanel } from './RoleRosterPanel'
import { RoomAnnouncements } from './RoomAnnouncements'
import { OnboardingChecklist } from './RoomArrivalPanels'
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
import type { VenueMapConfig } from '../../../lib/venue-map'
import type {
  Event,
  EventVenueMember,
  VenueOccupant,
  VenueRole,
  VenueRoom,
} from '../../../types'
import { useLingui } from '@lingui/react/macro'
import { TeamWorkspacePanel } from './homebase/TeamWorkspacePanel'
import { TeamShelf } from './homebase/TeamShelf'
import { RunOfShowPanel } from './RunOfShowPanel'
import { RoomQuestionsPanel } from './RoomQuestionsPanel'
import { HelpQueuePanel } from './HelpQueuePanel'
import { AnnounceAllPanel, BookingSlotsPanel, KitPanel, LibraryPanel } from './RoomToolPanels'
import { LineupPanel, OnNextPanel } from './StageLineupPanels'
import { OpsAlertsPanel } from './OpsAlertsPanel'
import { CheckInTool } from './CheckInTool'
import { RoomChallengeCard } from './RoomChallengeCard'
import { RoomNotesPanel } from './RoomNotesPanel'
import { MentorCardsPanel } from './MentorCardsPanel'
import { SetupChecksPanel } from './SetupChecksPanel'
import { WhereToGoPanel } from './WhereToGoPanel'
import { QuestBoardPanel } from './QuestBoardPanel'
import { CollabCommonsPanel } from './CollabCommonsPanel'
import { CoffeeTablesPanel } from './CoffeeTablesPanel'
import { TeamFinderPanel } from './TeamFinderPanel'
import { OrganiserOpsPanel } from './OrganiserOpsPanel'
import { SubmissionDeskPanel } from './judging/SubmissionDeskPanel'
import { JudgingConsolePanel } from './judging/JudgingConsolePanel'
import { ResultsBoardPanel } from './judging/ResultsBoardPanel'
import { PeoplesChoicePanel } from './judging/PeoplesChoicePanel'

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
   * The venue's floors, off event.venue_map. Panels that name another room say
   * which level it is on — two rooms called "Team Pod" are the same row twice
   * otherwise, and "upstairs" is the part somebody is actually asking about.
   */
  mapConfig: VenueMapConfig
  /**
   * Reactions, raised hands and who is presenting, subscribed once by the page.
   *
   * Held here rather than inside the panels that use it because a hook per
   * panel would open the same room channel several times over and multiply
   * every event by however many panels happened to be switched on.
   */
  signals: ReturnType<typeof useRoomSignals>
}

/**
 * The room, assembled.
 *
 * Which panels appear is data (venue_rooms.sections, or the kind's defaults) —
 * see src/lib/venue-room-sections.ts. Where they sit is one shape for every
 * room — see src/lib/venue-room-shell.ts: a band across the top, the call, the
 * room's own tool, a shelf of everything else, and a dock on the right with
 * Chat, People and one tab for this kind of room. This file is the map from an
 * id to a component, and the one place that changes when a section is added.
 *
 * Sections that have nothing to show render null and their cell removes itself
 * (the `:has(> div:empty)` rule), so a sponsor banner in a room with no sponsor
 * leaves no gap.
 */
export function RoomSections({
  context,
  className,
}: {
  context: RoomSectionContext
  className?: string
}) {
  const { t, i18n } = useLingui()
  const { event, room, viewerRole } = context
  const [dockCollapsed, setDockCollapsed] = useDockCollapsed()
  const [sharer, setSharer] = useState<CallSharer | null>(null)
  const [mainId, setMainId] = useMainCard(room.id)

  const resolved = useMemo(
    () => sectionsForRoom(room, viewerRole, event.event_type),
    [room, viewerRole, event.event_type]
  )
  const ordered = useMemo(() => {
    const byId = new Map(resolved.map((s) => [s.def.id as RoomSectionId, s]))
    return orderSectionIds(
      room.kind,
      resolved.map((s) => s.def.id as RoomSectionId)
    )
      .map((id) => byId.get(id))
      .filter((s): s is ResolvedRoomSection => !!s)
  }, [resolved, room.kind])

  const byId = useMemo(() => new Map(ordered.map((s) => [s.def.id as RoomSectionId, s])), [ordered])
  const plan = useMemo(() => {
    const ids = ordered.map((s) => s.def.id as RoomSectionId)
    // The call has its own reaction button. The emoji row only earns its place
    // where there is no live call to put it in.
    const withCall = ids.includes('av_placeholder') && isVenueVideoConfigured()
    return planRoomShell(room.kind, withCall ? ids.filter((id) => id !== 'reactions') : ids)
  }, [ordered, room.kind])

  if (!ordered.length) return null

  const render = (id: RoomSectionId, fill = false) => {
    const section = byId.get(id)
    return section ? (
      <RoomSection
        section={section}
        context={context}
        fill={fill}
        onShareChange={id === 'av_placeholder' ? setSharer : undefined}
      />
    ) : null
  }

  // A huddle's call is a slim strip over the room's tool. A share grows it into
  // a presentation and pushes the tool down, so say where the tool went.
  const huddle = cameraModeFor(room, { presenting: !!context.signals.presenter }) === 'huddle'
  const toolName = plan.tool ? i18n._(byId.get(plan.tool)!.def.label) : null
  const sharerName = sharer?.name ?? ''
  const grewNote =
    sharer && huddle && toolName
      ? sharer.mine
        ? t`You are sharing, so the call grew to fill the room. ${toolName} is just below.`
        : t`${sharerName} started sharing, so the call grew to fill the room. ${toolName} is just below.`
      : null
  // Any card of the room can be made the main one: it moves to the top of the
  // room at full width, and stays there on this device until it is put back.
  // The choice only counts while that card is one this room is showing.
  const movable = new Set<RoomSectionId>([...(plan.call ? [plan.call] : []), ...(plan.tool ? [plan.tool] : []), ...plan.shelf])
  const main = mainId && movable.has(mainId as RoomSectionId) ? (mainId as RoomSectionId) : null
  const cell = (id: RoomSectionId, extra?: string, canExpand = true) => {
    const isMain = id === main
    const name = i18n._(byId.get(id)!.def.label)
    return (
      <div
        key={id}
        data-room-section={id}
        className={cn('relative min-w-0 scroll-mt-[calc(var(--nav-h)+5rem)] [&:has(>div:empty)]:hidden', extra)}
      >
        <div>{render(id)}</div>
        {canExpand && movable.size > 1 && (
          // On the card's top right corner, half outside it, so it never sits
          // on a header's own chips or buttons.
          <button
            type="button"
            aria-pressed={isMain}
            aria-label={isMain ? t`Put ${name} back in its place` : t`Make ${name} the main card`}
            title={isMain ? t`Put back` : t`Make this the main card`}
            onClick={() => setMainId(isMain ? null : id)}
            className={cn(
              'absolute -right-2 -top-2.5 z-raised grid h-8 w-8 place-items-center pointer-coarse:h-11 pointer-coarse:w-11 rounded-full border shadow-card transition-colors',
              isMain
                ? 'border-ktip-ocean-600 bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700'
                : 'border-ktip-sand-200 bg-ktip-cream text-ktip-sand-600 hover:border-ktip-ocean-400 hover:text-ktip-ocean-700'
            )}
          >
            {isMain ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
          </button>
        )}
      </div>
    )
  }

  // Short names in the dock, as in the design. A host can rename a tab for one
  // room ("Desk team", "Stage crew") with `label` on that section's config.
  const dockLabel = (id: RoomSectionId): string => {
    const own = byId.get(id)?.config.label
    if (typeof own === 'string' && own.trim()) return own.trim().slice(0, 24)
    switch (id) {
      case 'chat':
        return room.kind === 'team' ? t`Team chat` : room.kind === 'judging' ? t`Judges’ chat` : t`Chat`
      case 'occupants':
        return room.kind === 'team' ? t`Members` : t`People`
      case 'qa':
        return t`Q&A`
      case 'hand_queue':
        return t`Hands`
      case 'mentors_on_duty':
        return t`Mentors`
      case 'sponsor_links':
        return t`Links`
      case 'announcements':
        return t`News`
      default:
        return i18n._(byId.get(id)!.def.label)
    }
  }
  const dockCount = (id: RoomSectionId): number | undefined =>
    id === 'occupants'
      ? context.inRoom.length
      : id === 'hand_queue'
        ? context.signals.hands.length
        : undefined
  const dockTabs: DockTab[] = plan.dock.map((id) => ({
    id,
    label: dockLabel(id),
    count: dockCount(id),
    node: render(id, true),
  }))
  const hasDock = dockTabs.length > 0

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {plan.band.map((id) => cell(id, undefined, false))}

      <div
        className={cn(
          'grid grid-cols-1 gap-4',
          hasDock && (dockCollapsed ? 'lg:grid-cols-[minmax(0,1fr)_3.25rem]' : 'lg:grid-cols-[minmax(0,1fr)_22rem]')
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {main && cell(main)}
          {plan.call && plan.call !== main && cell(plan.call)}
          {grewNote && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-surface border border-dashed border-ktip-sand-300 bg-ktip-cream px-4 py-3 text-sm text-ktip-sand-700"
            >
              <Info size={16} className="mt-0.5 shrink-0 text-ktip-ocean-600" aria-hidden="true" />
              {grewNote}
            </p>
          )}
          {plan.tool && plan.tool !== main && cell(plan.tool)}
        </div>

        {/* After the call and tool in the page order, so on a phone chat sits
            right under them; beside them, spanning both rows, on a desktop. */}
        {hasDock && (
          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <RoomDock
              roomId={room.id}
              tabs={dockTabs}
              collapsed={dockCollapsed}
              onCollapsedChange={setDockCollapsed}
            />
          </div>
        )}

        {plan.shelf.some((id) => id !== main) && (
          <div className="grid min-w-0 grid-cols-1 content-start gap-4 md:grid-cols-2 lg:col-start-1">
            {plan.shelf.filter((id) => id !== main).map((id) =>
              cell(
                id,
                WIDE_ON_SHELF.has(id) || (id === 'countdown' && room.kind === 'team') ? 'md:col-span-2' : undefined
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Panels that need the shelf's full width: galleries, tables, boards. */
const WIDE_ON_SHELF = new Set<RoomSectionId>([
  'showcase_gallery',
  'peoples_choice',
  'results_board',
  'organiser_ops',
  'quest_board',
  'team_finder',
  'collab_commons',
  'coffee_tables',
  'judging_console',
  'submission_desk',
  'check_in',
  'sponsor_hero',
  'room_notes',
  'booking_slots',
  'team_workspace',
  'reactions',
])

const mainKey = (roomId: string) => `ktip.room.main.${roomId}`

/** Which card this person made the main one in this room, kept on this device. */
function useMainCard(roomId: string): [string | null, (id: string | null) => void] {
  const read = () => {
    try {
      return localStorage.getItem(mainKey(roomId))
    } catch {
      return null
    }
  }
  const [state, setState] = useState<{ roomId: string; id: string | null }>(() => ({ roomId, id: read() }))
  // Another room: read that room's own choice.
  const id = state.roomId === roomId ? state.id : read()
  const update = useCallback(
    (next: string | null) => {
      setState({ roomId, id: next })
      try {
        if (next) localStorage.setItem(mainKey(roomId), next)
        else localStorage.removeItem(mainKey(roomId))
      } catch {
        // Blocked storage: the choice lasts for this visit.
      }
    },
    [roomId]
  )
  return [id, update]
}

const DOCK_COLLAPSED_KEY = 'ktip.room.dock.collapsed'

/** The dock folded to a rail, remembered on this device for every room. */
function useDockCollapsed(): [boolean, (collapsed: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(DOCK_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const update = useCallback((next: boolean) => {
    setCollapsed(next)
    try {
      localStorage.setItem(DOCK_COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // Blocked storage: it lasts for this visit.
    }
  }, [])
  return [collapsed, update]
}

function RoomSection({
  section,
  context,
  fill,
  onShareChange,
}: {
  section: ResolvedRoomSection
  context: RoomSectionContext
  /** True when the layout gave this a tall cell to fill. */
  fill: boolean
  /** The call reports who is sharing, for the note under it. */
  onShareChange?: (sharer: CallSharer | null) => void
}) {
  const { t } = useLingui()
  const {
    event,
    room,
    rooms,
    occupants,
    inRoom,
    viewerRole,
    isHost,
    membership,
    mapConfig,
    signals,
  } = context
  const canPost = viewerRole !== 'spectator' && room.is_open
  const floors = mapConfig.floors

  switch (section.def.id) {
    case 'sponsor_hero':
      return <SponsorHero room={room} config={section.config} />

    case 'check_in':
      return <CheckInTool event={event} membership={membership} rooms={rooms} floors={floors} />

    case 'host_controls':
      return <HostControlsPanel room={room} signals={signals} />

    case 'organiser_ops':
      return <OrganiserOpsPanel event={event} occupants={occupants} isHost={isHost} />

    case 'av_placeholder':
      return (
        <AvStage
          room={room}
          mode={cameraModeFor(room, { presenting: !!signals.presenter })}
          occupants={inRoom}
          presenter={signals.presenter}
          fill={fill}
          signals={signals}
          onShareChange={onShareChange}
          title={typeof section.config.title === 'string' ? section.config.title.trim().slice(0, 60) || undefined : undefined}
          boardAgenda={parseBoardAgenda(section.config.board)}
        />
      )

    case 'reactions':
      return <ReactionsBar signals={signals} />

    case 'focus_timer':
      return <FocusTimerPanel />

    case 'caption_test':
      // Backstage: camera, microphone and screen share first, then how you
      // will read in other languages.
      return (
        <div className="flex flex-col gap-4">
          <SetupChecksPanel />
          <CaptionTestPanel room={room} />
        </div>
      )

    case 'objectives':
      return <RoomTextSection variant="objectives" config={section.config} room={room} />

    case 'rules':
      return <RoomTextSection variant="rules" config={section.config} room={room} />

    case 'resources':
      return <RoomResourcesPanel event={event} isHost={isHost} />

    case 'faq':
      return <RoomFaqPanel eventId={event.id} />

    case 'challenge_brief':
      return <RoomChallengeCard event={event} />

    case 'showcase_gallery':
      return (
        <EventSolutionsPanel
          eventId={event.id}
          eventStatus={event.status}
          submissionDeadline={event.submission_deadline ?? null}
          isOrganizer={isHost}
        />
      )

    // The cell owns the height now, so the chat fills it instead of carrying a
    // hand-tuned one. The min-height is for the stacked, one-column case.
    case 'chat':
      return (
        <div data-tutorial="room-chat" className="h-full">
          <RoomChatPanel
            room={room}
            canPost={canPost}
            canModerate={isHost}
            className={fill ? 'h-full min-h-[24rem]' : 'h-[32rem]'}
          />
        </div>
      )

    case 'team_workspace':
      return <TeamWorkspacePanel eventId={event.id} room={room} isHost={isHost} />

    case 'coffee_tables':
      return <CoffeeTablesPanel room={room} />

    case 'collab_commons':
      return <CollabCommonsPanel eventId={event.id} isHost={isHost} />

    case 'quest_board':
      return <QuestBoardPanel eventId={event.id} isHost={isHost} />

    case 'team_finder':
      return (
        <TeamFinderPanel
          eventId={event.id}
          viewerRole={viewerRole}
          isHost={isHost}
          occupants={occupants}
          fill={fill}
        />
      )
    // Migration 192. Each panel asks one SECURITY DEFINER function what this
    // viewer may see, and renders nothing when the answer is nothing.
    case 'submission_desk':
      return <SubmissionDeskPanel event={event} isHost={isHost} />

    case 'judging_console':
      return <JudgingConsolePanel event={event} />

    case 'results_board':
      return <ResultsBoardPanel event={event} />

    case 'peoples_choice':
      return <PeoplesChoicePanel event={event} />

    // The same panel with posting closed to everyone but the host. A separate
    // id rather than a flag on `chat` so the host's picker offers the two as
    // the choice they actually are.
    case 'announcement_feed':
      return (
        <RoomChatPanel
          room={room}
          canPost={isHost && room.is_open}
          canModerate={isHost}
          highlightHosts={false}
          className={fill ? 'h-full min-h-[20rem]' : 'h-[24rem]'}
        />
      )

    case 'occupants':
      return (
        <div data-tutorial="room-presence" className="h-full">
          <RoomOccupantList
            occupants={inRoom}
            title={t`In this room`}
            emptyLabel={t`You are the first one here.`}
            fill={fill}
            dense
            handsUp={signals.hands.map((h) => h.userId)}
          />
        </div>
      )

    case 'hand_queue':
      return <HandQueuePanel signals={signals} />

    case 'looking_for_team':
      return <LookingForTeamPanel eventId={event.id} occupants={occupants} fill={fill} />

    case 'skill_finder':
      return <SkillFinderPanel eventId={event.id} occupants={occupants} fill={fill} />

    case 'help_nudge':
      return (
        <HelpNudgePanel
          occupants={occupants}
          event={event}
          rooms={rooms}
          floors={floors}
          fill={fill}
        />
      )

    case 'mentors_on_duty':
      return (
        <RoleRosterPanel
          occupants={occupants}
          role="mentor"
          title={t`Mentors on duty`}
          emptyLabel={t`No mentors in the venue yet.`}
          event={event}
          rooms={rooms}
          floors={floors}
          fill={fill}
        />
      )

    case 'judges_present':
      return (
        <RoleRosterPanel
          occupants={occupants}
          role="judge"
          title={t`Judges`}
          emptyLabel={t`No judges in the venue yet.`}
          event={event}
          rooms={rooms}
          floors={floors}
          fill={fill}
        />
      )

    // In a Homebase the deadline comes with the team's milestones and what is
    // left to hand in; everywhere else it is the plain countdown.
    case 'countdown':
      return room.kind === 'team' ? (
        <TeamShelf event={event} room={room} />
      ) : (
        <RoomCountdown deadline={event.submission_deadline} />
      )

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
      // The short form, as the Registration Desk has it: one line per floor.
      return section.config.compact === true ? (
        <WhereToGoPanel event={event} rooms={rooms} floors={floors} />
      ) : (
        <WayfindingPanel
          event={event}
          rooms={rooms}
          currentRoomId={room.id}
          occupants={occupants}
          floors={floors}
          fill={fill}
        />
      )

    case 'ops_alerts':
      return <OpsAlertsPanel eventId={event.id} occupants={occupants} />

    case 'lineup':
      return <LineupPanel event={event} room={room} isHost={isHost} />

    case 'on_next':
      return <OnNextPanel event={event} rooms={rooms} />

    case 'kit':
      return <KitPanel room={room} isHost={isHost} canPost={canPost} />

    case 'room_notes':
      return <RoomNotesPanel room={room} canPost={canPost} />

    case 'booking_slots':
      // `cards` draws the same slots one card per person, as a mentor lounge
      // wants them; organisers keep the plain list under it to offer times.
      return section.config.cards === true ? (
        <div className="flex flex-col gap-4">
          <MentorCardsPanel
            room={room}
            canPost={canPost}
            occupants={occupants}
            title={typeof section.config.title === 'string' ? section.config.title.trim().slice(0, 40) || undefined : undefined}
          />
          {isHost && <BookingSlotsPanel room={room} isHost={isHost} canPost={canPost} title={t`Times on offer`} />}
        </div>
      ) : (
        <BookingSlotsPanel
          room={room}
          isHost={isHost}
          canPost={canPost}
          title={typeof section.config.title === 'string' ? section.config.title.trim().slice(0, 40) || undefined : undefined}
        />
      )

    case 'library':
      return <LibraryPanel eventId={event.id} isHost={isHost} />

    case 'announce_all':
      return <AnnounceAllPanel eventId={event.id} openRooms={(rooms ?? []).filter((r) => r.is_open).length} />

    case 'help_queue':
      return <HelpQueuePanel room={room} viewerRole={viewerRole} isHost={isHost} canPost={canPost} occupants={occupants} />

    case 'qa':
      return <RoomQuestionsPanel room={room} canPost={canPost} isHost={isHost} fill={fill} />

    case 'run_of_show':
      return (
        <RunOfShowPanel
          eventId={event.id}
          title={typeof section.config.title === 'string' ? section.config.title.trim().slice(0, 40) || undefined : undefined}
        />
      )

    case 'venue_headcount':
      return <VenueHeadcountPanel occupants={occupants} />

    default:
      return null
  }
}
