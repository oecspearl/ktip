import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useEventCriteria } from '../../../hooks/useEventCriteria'
import { sectionsForRoom } from '../../../lib/venue-room-sections'
import type { ResolvedRoomSection, RoomSectionId } from '../../../lib/venue-room-sections'
import {
  canBeHero,
  cameraModeFor,
  hostHeroOf,
  orderSectionIds,
  readHeroPin,
  resolveHero,
  spanClass,
  spanFills,
  spanKeyFor,
  writeHeroPin,
} from '../../../lib/venue-room-layout'
import type { HeroPin } from '../../../lib/venue-room-layout'
import { EventChallengeBrief } from '../../events/EventChallengeBrief'
import { EventSolutionsPanel } from '../../events/EventSolutionsPanel'
import { RoomChatPanel } from '../RoomChatPanel'
import { RoomOccupantList } from '../RoomOccupantList'
import { AvStage } from './AvStage'
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
import type { VenueMapConfig } from '../../../lib/venue-map'
import type {
  Event,
  EventVenueMember,
  VenueOccupant,
  VenueRole,
  VenueRoom,
} from '../../../types'
import { useLingui } from '@lingui/react/macro'

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
 * see src/lib/venue-room-sections.ts. *Where they sit* is also data, per kind —
 * see src/lib/venue-room-layout.ts. This file is only the map from an id to a
 * component, and it is the one place that has to change when a section is added.
 *
 * One grid, not a main column and an aside: an eight-and-four split of video and
 * chat cannot be expressed as "a column and a 20rem rail", and every kind wants
 * a different one of those splits.
 *
 * Sections that have nothing to show render null and their cell removes itself
 * — the `:has(> div:empty)` rule below plus `grid-flow-dense`, so a sponsor
 * banner on a room with no sponsor leaves no hole where a card should be.
 */
export function RoomSections({
  context,
  className,
}: {
  context: RoomSectionContext
  className?: string
}) {
  const { t } = useLingui()
  const { room, viewerRole, signals } = context

  const resolved = useMemo(() => sectionsForRoom(room, viewerRole), [room, viewerRole])
  const ordered = useMemo(() => {
    const byId = new Map(resolved.map((s) => [s.def.id as RoomSectionId, s]))
    return orderSectionIds(
      room.kind,
      resolved.map((s) => s.def.id as RoomSectionId)
    )
      .map((id) => byId.get(id))
      .filter((s): s is ResolvedRoomSection => !!s)
  }, [resolved, room.kind])

  const visible = useMemo(() => ordered.map((s) => s.def.id as RoomSectionId), [ordered])
  const hero = useRoomHero(room, visible, signals.presenter?.since ?? null)

  if (!ordered.length) return null

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 lg:auto-rows-[minmax(11rem,auto)] lg:grid-flow-dense lg:grid-cols-12',
        className
      )}
    >
      {ordered.map((section) => {
        const id = section.def.id as RoomSectionId
        const span = spanKeyFor(room.kind, id, hero.active)
        const isHero = id === hero.active

        return (
          <div
            key={id}
            // Named so the browser can morph this exact cell from where it was
            // to where it is going. Without a name per cell the whole grid
            // cross-fades, which reads as a flicker rather than a movement.
            style={{ viewTransitionName: `vt-room-${id.replace(/_/g, '-')}` }}
            className={cn(
              // The wrapper is what collapses when a section renders nothing,
              // which is why the pin button below is a sibling of the content
              // rather than inside it: an empty cell must stay empty.
              'group/cell relative lg:min-h-0 [&:has(>div:empty)]:hidden',
              spanClass(span)
            )}
          >
            <div className="h-full">
              <RoomSection section={section} context={context} fill={spanFills(span)} />
            </div>

            {canBeHero(room.kind, id) && (
              <button
                type="button"
                onClick={() => hero.promote(id)}
                aria-label={isHero ? t`Stop keeping this panel large` : t`Make this the big panel`}
                title={isHero ? t`Stop keeping this large` : t`Make this the big panel`}
                className="absolute right-2 top-2 z-20 hidden rounded-lg border border-ktip-sand-200 bg-ktip-cream/90 p-1.5 text-ktip-sand-500 opacity-0 shadow-card transition-opacity hover:text-ktip-ocean-700 focus-visible:opacity-100 group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 lg:block"
              >
                {isHero ? (
                  <Minimize2 size={13} aria-hidden="true" />
                ) : (
                  <Maximize2 size={13} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Which panel is the big one, and the click that changes it.
 *
 * The pin is this person's, on this device — see venue-room-layout.ts for why
 * it is not a column. Clicking the panel that is already large clears the pin
 * rather than re-setting it, so the same control hands the room back to the
 * automatic behaviour, which is the only way somebody who pinned chat during a
 * talk gets the presenter back without knowing they have to.
 *
 * The rendered hero is a *step behind* the resolved one on purpose. Swapping
 * col-span and row-span is a grid reflow, and no amount of `transition` will
 * tween a grid track — the cells simply appear somewhere else. So the change is
 * applied inside a view transition, which lets the browser morph every cell
 * from its old box to its new one. Routing it through state rather than through
 * the click handler means a hero taken over by whoever is presenting animates
 * the same way as one the reader promoted themselves.
 */
function useRoomHero(room: VenueRoom, visible: RoomSectionId[], presentingSince: number | null) {
  const [pin, setPin] = useState<HeroPin | null>(() => readHeroPin(room.id))

  useEffect(() => {
    setPin(readHeroPin(room.id))
  }, [room.id])

  const hostHero = useMemo(() => hostHeroOf(room), [room])

  const target = resolveHero({
    visible,
    kind: room.kind,
    hostHero,
    presentingSince,
    pin,
  })

  const [active, setActive] = useState(target)

  useEffect(() => {
    if (target === active) return
    startBentoTransition(() => flushSync(() => setActive(target)))
  }, [target, active])

  const promote = useCallback(
    (id: RoomSectionId) => {
      const next = pin?.id === id ? null : { id, at: Date.now() }
      setPin(next)
      writeHeroPin(room.id, next)
    },
    [pin, room.id]
  )

  return { active, pin, promote }
}

/**
 * Re-lay-out the bento with a morph rather than a jump.
 *
 * Falls straight through on a browser without view transitions and on anyone
 * who has asked for less motion — in both cases the layout still changes, it
 * just changes instantly, which is exactly what it did before this existed.
 *
 * flushSync is required, not defensive: startViewTransition captures the DOM
 * when its callback returns, and a React state update that has not been flushed
 * by then would be captured as "nothing changed".
 */
function startBentoTransition(apply: () => void) {
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown })
    .startViewTransition

  if (
    typeof start !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    apply()
    return
  }

  start.call(document, apply)
}

function RoomSection({
  section,
  context,
  fill,
}: {
  section: ResolvedRoomSection
  context: RoomSectionContext
  /** True when the layout gave this a tall cell to fill. */
  fill: boolean
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
      return <SponsorHero room={room} />

    case 'check_in':
      return <CheckInCard event={event} />

    case 'host_controls':
      return <HostControlsPanel room={room} signals={signals} />

    case 'av_placeholder':
      return (
        <AvStage
          room={room}
          mode={cameraModeFor(room, { presenting: !!signals.presenter })}
          occupants={inRoom}
          presenter={signals.presenter}
          fill={fill}
        />
      )

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

    // The same panel with posting closed to everyone but the host. A separate
    // id rather than a flag on `chat` so the host's picker offers the two as
    // the choice they actually are.
    case 'announcement_feed':
      return (
        <RoomChatPanel
          room={room}
          canPost={isHost && room.is_open}
          canModerate={isHost}
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
          floors={floors}
          fill={fill}
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
