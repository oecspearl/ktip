import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CalendarClock, Hand, Lock, MessageSquare, Plus, Star, UserPlus, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useEvent } from '../../hooks/useEvents'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { venuePath, venueRoomPath } from '../../lib/event-slug'
import { rememberVenueRoom } from '../../lib/venue-last-room'
import { IrisLink } from '../../components/ui/IrisTransition'
import { useVenuePresenceContext } from '../../contexts/VenuePresenceContext'
import { useRoomSignals } from '../../hooks/useRoomSignals'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueTopBar } from '../../components/venue/VenueTopBar'
import { AvatarCluster } from '../../components/venue/AvatarCluster'
import { RoomSections } from '../../components/venue/room/RoomSections'
import { focusRoomSection } from '../../components/venue/room/RoomDock'
import { HomebaseLookPanel } from '../../components/venue/room/HomebaseLookPanel'
import { homebaseAccess, useEventTeams } from '../../hooks/useEventTeams'
import { guestOf, useBridges } from '../../hooks/useBridges'
import { BridgeRequestCard } from '../../components/venue/room/homebase/Bridges'
import type { RoomSectionContext } from '../../components/venue/room/RoomSections'
import { Button } from '../../components/ui/Button'
import { occupantsInRoom } from '../../lib/venue-presence'
import { roomUsesSignals, roomViewerRole, sectionsForRoom } from '../../lib/venue-room-sections'
import { useVenueRoomRoles } from '../../hooks/useVenue'
import { roomUsesStage } from '../../lib/venue-room-layout'
import { mapConfigOf } from '../../hooks/useVenueMap'
import { floorLabel } from '../../lib/venue-map'
import {
  VENUE_ROOM_KIND_ICONS,
  VENUE_ROOM_KIND_LABELS,
} from '../../lib/constants'
import { resolveIcon } from '../../lib/icon-map'
import { entityPath } from '../../lib/slug'
import { Trans, useLingui } from '@lingui/react/macro'


/**
 * Each kind of room's colour, from the revamp's design: sun for meeting
 * people, ocean for talks and team rooms, green for building, sand for quiet
 * and judging. Only the site's own colour families.
 */
const KIND_TONE: Record<string, { tile: string; eyebrow: string }> = {
  main_hall: { tile: 'bg-ktip-ocean-50 text-ktip-ocean-700', eyebrow: 'text-ktip-ocean-600' },
  stage: { tile: 'bg-ktip-ocean-50 text-ktip-ocean-700', eyebrow: 'text-ktip-ocean-600' },
  team: { tile: 'bg-ktip-ocean-50 text-ktip-ocean-700', eyebrow: 'text-ktip-ocean-600' },
  sponsor_booth: { tile: 'bg-ktip-ocean-50 text-ktip-ocean-700', eyebrow: 'text-ktip-ocean-600' },
  networking: { tile: 'bg-ktip-sun-50 text-ktip-sun-700', eyebrow: 'text-ktip-sun-700' },
  help_desk: { tile: 'bg-ktip-sun-50 text-ktip-sun-700', eyebrow: 'text-ktip-sun-700' },
  workshop: { tile: 'bg-ktip-tropical-50 text-ktip-tropical-700', eyebrow: 'text-ktip-tropical-700' },
  judging: { tile: 'bg-ktip-sand-100 text-ktip-sand-700', eyebrow: 'text-ktip-sand-600' },
  breakout: { tile: 'bg-ktip-sand-100 text-ktip-sand-700', eyebrow: 'text-ktip-sand-600' },
}

/** Two letters for a team's tile: "Team Coralline" reads TC. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2)
  return letters.toUpperCase()
}

/**
 * Inside one room.
 *
 * Presence still comes from the single venue channel — being "in" a room is a
 * field on the tracked payload, not a separate subscription. The only per-room
 * subscription is chat, and it exists only while this page is mounted.
 *
 * The page owns the chrome — the top bar, the room header, the join gate — and
 * nothing else. What is *inside* a room is a list of sections resolved from
 * venue_rooms.sections (091), which is why a sponsor booth and a judging room
 * no longer differ only by their icon.
 */
export default function EventVenueRoomPage() {
    const { t } = useLingui()
  const params = useParams()
  const auth = useAuth()

  // /events/virtual-hackathon/<slug>/room/<room key> — both segments are
  // readable slugs, so the room is found through the venue's room list rather
  // than fetched by uuid. That list is already cached by the floorplan.
  const { event, loading: eventLoading } = useEvent(params.slug)
  const eventId = event?.id
  const { rooms, loading: roomsPending } = useVenueRooms(eventId)
  // Both of these queries are disabled until the slug resolves, and a disabled
  // query reports isPending — without the gate an unknown slug never renders.
  const roomLoading = !!eventId && roomsPending
  const room = useMemo(
    () => rooms?.find((r) => r.key === params.roomKey) ?? null,
    [rooms, params.roomKey]
  )
  const roomId = room?.id
  // So the map, when this member walks back out, stands them where this room
  // is, on its floor, rather than at the front entrance on the ground.
  useEffect(() => {
    if (eventId && roomId) rememberVenueRoom(eventId, roomId)
  }, [eventId, roomId])
  // Already on the event row (089) and already fetched — the floors are what
  // let every panel that names another room say which level it is on.
  const mapConfig = useMemo(() => mapConfigOf(event), [event])
  // Session and presence come from the layout's provider — the channel was
  // already joined on the floorplan, and it derives this room from the URL,
  // so entering here is one track() rather than a fresh subscription.
  const { membership, joining, joinError, presence } = useVenuePresenceContext()
  // Per-room roles (109): a judge for one room sees the judging console there.
  const { roomRoles } = useVenueRoomRoles(membership ? eventId : undefined)
  const viewerRole = useMemo(
    () => (room ? roomViewerRole(membership?.role, roomRoles, room, auth.user?.id) : membership?.role ?? null),
    [room, roomRoles, membership?.role, auth.user?.id]
  )

  // The room header's buttons. A panel below the header (the Homebase look)
  // puts its own button here, so the header stays the one place for actions.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)

  const venueFallbackTitle = t`Venue`
  usePageTitle(room ? t`${room.name} | ${event?.title ?? venueFallbackTitle}` : t`Venue room`)

  const me = useMemo(
    () =>
      membership && auth.user
        ? {
            user_id: auth.user.id,
            display_name: auth.profile?.display_name ?? null,
            avatar_url: auth.profile?.avatar_url ?? null,
            role: membership.role,
            team_id: null,
          }
        : null,
    [membership, auth.user, auth.profile]
  )

  // Who owns this room, if it is a Homebase (188/190). A claimed Homebase is
  // its team's and the hosts'; the server refuses everyone else at the door,
  // on the call and on the chat, and this page says so instead of rendering
  // panels that would all fail.
  const { teams } = useEventTeams(eventId)
  const { bridges } = useBridges(eventId)
  const myTeam = useMemo(
    () => teams.find((x) => x.members.some((m) => m.user_id === auth.user?.id)) ?? null,
    [teams, auth.user?.id]
  )
  const homebase = useMemo(
    () =>
      room && room.kind === 'team'
        ? homebaseAccess(teams, room.id, auth.user?.id, membership?.role === 'organizer', guestOf(bridges, myTeam?.id))
        : null,
    [room, teams, bridges, myTeam, auth.user?.id, membership?.role]
  )

  const inRoom = useMemo(
    () => (roomId ? occupantsInRoom(presence.occupants, roomId) : []),
    [presence.occupants, roomId]
  )

  // Subscribed here, not inside the panels that use it: the main and aside
  // columns are separate trees, so a hook in each would open the same channel
  // twice. can_use_room_channel() refuses closed and team rooms, so those get
  // a hook that never connects rather than a failing subscribe.
  const signals = useRoomSignals({
    roomId,
    me: me
      ? { userId: me.user_id, name: me.display_name || t`Member`, avatarUrl: me.avatar_url }
      : null,
    // Only when a panel on this room actually uses it: reactions, a hand queue,
    // or a call somebody could present in. A room with none of the three opens
    // no channel, because an unused private channel is an auth round trip plus
    // a rejoin on every reconnect for nothing.
    enabled:
      !!room &&
      room.is_open &&
      (room.kind !== 'team' || !!homebase?.canUse) &&
      !!membership &&
      (roomUsesSignals(room, viewerRole, event?.event_type) ||
        roomUsesStage(room, viewerRole)),
  })

  if (eventLoading || roomLoading || joining) {
    return (
      <div className="mx-auto max-w-[1640px] space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
        <div className="h-14 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  if (!event || !room || room.event_id !== event.id) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900"><Trans>Room not found</Trans></h1>
        <Link
          to={event ? venuePath(event) : '/events'}
          className="mt-3 inline-block text-ktip-ocean-600 hover:underline"
        >
          <Trans>Back to the map</Trans>
        </Link>
      </div>
    )
  }

  if (joinError || !membership) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          <Trans>You are not in this venue</Trans>
        </h1>
        <p className="mt-2 text-ktip-sand-600">
          {(joinError as any)?.message || t`Register for this event to enter the venue.`}
        </p>
        <Link to={entityPath('event', event)} className="mt-5 inline-block">
          <Button><Trans>Go to the event page</Trans></Button>
        </Link>
      </div>
    )
  }

  if (homebase && !homebase.canUse) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <Lock size={28} className="mx-auto text-ktip-sand-400" aria-hidden="true" />
        <h1 className="mt-3 font-display text-2xl font-bold text-ktip-sand-900">
          <Trans>{homebase.team?.name}'s Homebase is private</Trans>
        </h1>
        <p className="mt-2 text-ktip-sand-600">
          <Trans>Only the team and the organisers can come in. You can ask to join their call for a while.</Trans>
        </p>
        {homebase.team && (
          <div className="mt-5 rounded-2xl border border-ktip-sand-200 bg-white p-4">
            <BridgeRequestCard eventId={event.id} hostTeam={homebase.team} myTeam={myTeam} />
          </div>
        )}
        <IrisLink to={venuePath(event)} className="mt-5 inline-block">
          <Button variant="secondary"><Trans>Back to the map</Trans></Button>
        </IrisLink>
      </div>
    )
  }

  const Icon = resolveIcon(VENUE_ROOM_KIND_ICONS[room.kind])
  const isHost = membership.role === 'organizer'
  const headcount = presence.occupants.filter((o) => o.availability !== 'offline').length
  // Named for the catalog: "{hereCount} here", not "{0} here".
  const hereCount = inRoom.length

  const sectionContext: RoomSectionContext = {
    event,
    room,
    rooms,
    occupants: presence.occupants,
    inRoom,
    viewerRole: viewerRole ?? membership.role,
    isHost,
    membership,
    mapConfig,
    signals,
  }

  // Whose Homebase this is, for the tile: the team's initials on its colour.
  const roomTeam = room.kind === 'team' ? teams.find((x) => x.homebase_room_id === room.id) ?? null : null
  const teamColor = (room as { decor?: { color?: string } }).decor?.color || room.color || null

  // Who may come in, said in the header so nobody wonders why a room is quiet.
  const allowed = new Set<string>(room.allowed_roles ?? [])
  const accessNote =
    allowed.size === 0
      ? null
      : allowed.has('speaker')
        ? t`Speakers only`
        : allowed.has('judge')
          ? t`Judges and organisers only`
          : allowed.has('mentor')
            ? t`Mentors and organisers only`
            : allowed.size === 1 && allowed.has('organizer')
              ? t`Organisers only`
              : null

  // A hand in the header, where a talk or a class is happening.
  const handKind = room.kind === 'workshop' || room.kind === 'main_hall' || room.kind === 'stage'
  const canRaiseHand = handKind && room.is_open && signals.connected && membership.role !== 'spectator'

  // "Breakout" says nothing about a room whose whole point is its tool, so the
  // eyebrow names the tool when the room has one of these.
  const shown = new Set(sectionsForRoom(room, viewerRole ?? membership.role, event.event_type).map((s) => s.def.id))
  const toolLabel = room.kind !== 'breakout'
    ? null
    : shown.has('organiser_ops')
      ? t`Operations`
      : shown.has('quest_board')
        ? t`Side quests`
        : shown.has('caption_test') || shown.has('on_next')
          ? t`Backstage`
          : shown.has('kit')
            ? t`Build`
            : shown.has('library')
              ? t`Library`
              : shown.has('mentors_on_duty') || shown.has('booking_slots')
                ? t`Mentors`
                : shown.has('focus_timer') && !shown.has('chat')
                  ? t`Focus`
                  : shown.has('collab_commons')
                    ? t`Between teams`
                    : null

  // The one thing most people came to this room to do, as a button in the
  // header. It takes them to the panel that does it.
  const headerAction = shown.has('help_queue')
    ? { label: t`Ask for help`, icon: Hand, section: 'help_queue', primary: true }
    : shown.has('coffee_tables') && (shown.has('looking_for_team') || shown.has('team_finder'))
      ? { label: t`Find a teammate`, icon: Users, section: shown.has('looking_for_team') ? 'looking_for_team' : 'team_finder', primary: false }
      : shown.has('collab_commons')
        ? { label: t`Open a bridge`, icon: Plus, section: 'collab_commons', primary: true }
        : shown.has('peoples_choice')
          ? { label: t`Vote`, icon: Star, section: 'peoples_choice', primary: false }
          : shown.has('booking_slots')
            ? { label: shown.has('kit') ? t`Book bench time` : t`Book 15 minutes`, icon: CalendarClock, section: 'booking_slots', primary: false }
            : shown.has('check_in') && shown.has('chat')
              ? { label: t`Ask the desk`, icon: MessageSquare, section: 'chat', primary: false }
              : null
  const HeaderActionIcon = headerAction?.icon
  // A room with neither a call nor chat says so, so the silence reads as meant.
  const quietNote = !shown.has('av_placeholder') && !shown.has('chat') && shown.has('focus_timer')
  // From your own Homebase, "Invite" goes to where people without a team are.
  const inviteRoom =
    roomTeam && myTeam?.id === roomTeam.id
      ? (rooms ?? []).find(
          (r) =>
            r.id !== room.id &&
            r.is_open &&
            sectionsForRoom(r, viewerRole ?? membership.role, event.event_type).some(
              (s) => s.def.id === 'looking_for_team' || s.def.id === 'team_finder'
            )
        ) ?? null
      : null

  const floorName = mapConfig.floors.length > 1
    ? mapConfig.floors[room.floor]?.name || floorLabel(room.floor)
    : null

  return (
    // pt clears the fixed navbar — see the note on EventVenuePage.
    <div className="min-h-svh bg-ktip-canvas pb-12 pt-[var(--nav-h)]">
      <VenueTopBar
        eventId={event.id}
        eventSlug={event.slug}
        eventType={event.event_type}
        eventTitle={event.title}
        headcount={headcount}
        faces={presence.occupants.filter((o) => o.availability !== 'offline').slice(0, 4)}
        connected={presence.connected}
        availability={presence.availability}
        isAuto={presence.manual === null || presence.manual !== presence.availability}
        onAvailabilityChange={presence.setAvailability}
        submissionDeadline={event.submission_deadline}
        backToMap
        crumbs={{ floor: floorName, room: room.name }}
      />

      <div className="mx-auto max-w-[1640px] px-3 py-6 sm:px-4">
        {/* The room's header, as in the revamp's design: a tile in the room's
            tone, the kind and level above a large name, and who is here. */}
        <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-4 pt-2">
          <div className="flex min-w-0 flex-[1_1_26rem] items-start gap-4">
            {roomTeam && teamColor ? (
              <span
                aria-hidden="true"
                className="flex h-13 w-13 shrink-0 items-center justify-center rounded-control font-display text-2xl font-bold text-white"
                style={{ backgroundColor: teamColor }}
              >
                {initialsOf(roomTeam.name)}
              </span>
            ) : (
              <span
                className={cn(
                  'flex h-13 w-13 shrink-0 items-center justify-center rounded-control',
                  KIND_TONE[room.kind]?.tile ?? KIND_TONE.main_hall.tile
                )}
              >
                <Icon size={26} aria-hidden="true" />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <p
                className={cn(
                  'flex flex-wrap items-center gap-x-2 text-micro font-extrabold uppercase tracking-[0.08em]',
                  KIND_TONE[room.kind]?.eyebrow ?? KIND_TONE.main_hall.eyebrow
                )}
              >
                {toolLabel || VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
                {/* Which level, on a venue that has more than one. */}
                {floorName && <span className="text-ktip-sand-400">· {floorName}</span>}
                {signals.presenter && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />
                    <Trans>Live</Trans>
                  </span>
                )}
              </p>
              <h1 className="text-balance font-display text-3xl font-bold leading-none text-ktip-sand-900 sm:text-4xl">
                {room.name}
              </h1>
              {room.description && (
                <p className="max-w-[66ch] text-sm text-ktip-sand-600">{room.description}</p>
              )}
            </div>
          </div>
          {/* Who is here, at a glance: the same faces the People tab lists. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-2.5">
            {inRoom.length > 0 && (
              <span className="flex items-center gap-2 text-xs font-bold text-ktip-sand-600">
                <AvatarCluster occupants={inRoom.slice(0, 4)} overflow={Math.max(0, inRoom.length - 4)} size="sm" />
                <Trans>{hereCount} here</Trans>
              </span>
            )}
            {!room.is_open && (
              <span className="flex items-center gap-1.5 rounded-full border border-ktip-sand-200 bg-ktip-sand-100 px-3 py-1 text-xs font-medium text-ktip-sand-600">
                <Lock size={12} aria-hidden="true" /> <Trans>Closed</Trans>
              </span>
            )}
            {accessNote && (
              <span className="rounded-full border border-ktip-sand-200 bg-ktip-sand-100 px-2.5 py-0.5 text-micro font-extrabold text-ktip-sand-700">
                {accessNote}
              </span>
            )}
            {quietNote && (
              <span className="rounded-full border border-ktip-sand-200 bg-ktip-sand-100 px-2.5 py-0.5 text-micro font-extrabold text-ktip-sand-700">
                <Trans>No call · chat off</Trans>
              </span>
            )}
            {headerAction && HeaderActionIcon && (
              <Button
                variant={headerAction.primary ? 'primary' : 'secondary'}
                size="sm"
                icon={<HeaderActionIcon size={15} aria-hidden="true" />}
                onClick={() => focusRoomSection(headerAction.section)}
              >
                {headerAction.label}
              </Button>
            )}
            {inviteRoom && (
              <IrisLink to={venueRoomPath(event, inviteRoom.key)}>
                <Button variant="secondary" size="sm" icon={<UserPlus size={15} aria-hidden="true" />}>
                  <Trans>Invite</Trans>
                </Button>
              </IrisLink>
            )}
            {canRaiseHand && (
              <Button
                variant="secondary"
                size="sm"
                aria-pressed={signals.myHandUp}
                icon={<Hand size={15} aria-hidden="true" />}
                onClick={() => signals.setHand(!signals.myHandUp)}
              >
                {signals.myHandUp ? (
                  <Trans>Lower hand</Trans>
                ) : room.kind === 'workshop' ? (
                  <Trans>Raise hand</Trans>
                ) : (
                  <Trans>Ask a question</Trans>
                )}
              </Button>
            )}
            {/* Buttons that belong to a panel below (the Homebase's Customise). */}
            <span ref={setActionsSlot} className="contents" />
          </div>
        </div>

        {/*
          What a room contains is data, and so is where it sits:
          venue_rooms.sections resolved against the kind's defaults (091), laid
          out by the kind's bento (src/lib/venue-room-layout.ts). Adding a panel
          is a registry entry plus a case in RoomSections — never a branch here.
        */}
        {/* A team's own room: its members (and hosts) can restyle it (188). */}
        {room.kind === 'team' && <HomebaseLookPanel room={room} actionsSlot={actionsSlot} />}
        <RoomSections context={sectionContext} />
      </div>
    </div>
  )
}
