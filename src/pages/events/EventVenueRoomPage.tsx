import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Lock } from 'lucide-react'
import { useEvent } from '../../hooks/useEvents'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { venuePath } from '../../lib/event-slug'
import { rememberVenueRoom } from '../../lib/venue-last-room'
import { IrisLink } from '../../components/ui/IrisTransition'
import { useVenuePresenceContext } from '../../contexts/VenuePresenceContext'
import { useRoomSignals } from '../../hooks/useRoomSignals'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueTopBar } from '../../components/venue/VenueTopBar'
import { RoomSections } from '../../components/venue/room/RoomSections'
import { HomebaseLookPanel } from '../../components/venue/room/HomebaseLookPanel'
import { homebaseAccess, useEventTeams } from '../../hooks/useEventTeams'
import { guestOf, useBridges } from '../../hooks/useBridges'
import { BridgeRequestCard } from '../../components/venue/room/homebase/Bridges'
import type { RoomSectionContext } from '../../components/venue/room/RoomSections'
import { Button } from '../../components/ui/Button'
import { occupantsInRoom } from '../../lib/venue-presence'
import { roomUsesSignals, roomViewerRole } from '../../lib/venue-room-sections'
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
        connected={presence.connected}
        availability={presence.availability}
        isAuto={presence.manual === null || presence.manual !== presence.availability}
        onAvailabilityChange={presence.setAvailability}
        backToMap
      />

      <div className="mx-auto max-w-[1640px] px-3 py-6 sm:px-4">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ktip-ocean-50 text-ktip-ocean-700">
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-ktip-ocean-600">
              {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
              {/* Which level, on a venue that has more than one. */}
              {floorName && <span className="text-ktip-sand-400"> · {floorName}</span>}
            </p>
            <h1 className="font-display text-2xl font-bold text-ktip-sand-900">{room.name}</h1>
            {room.description && (
              <p className="mt-1 text-sm text-ktip-sand-600">{room.description}</p>
            )}
          </div>
          {!room.is_open && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-ktip-sand-200 bg-ktip-sand-100 px-3 py-1 text-xs font-medium text-ktip-sand-600">
              <Lock size={12} aria-hidden="true" /> <Trans>Closed</Trans>
            </span>
          )}
        </div>

        {/*
          What a room contains is data, and so is where it sits:
          venue_rooms.sections resolved against the kind's defaults (091), laid
          out by the kind's bento (src/lib/venue-room-layout.ts). Adding a panel
          is a registry entry plus a case in RoomSections — never a branch here.
        */}
        {/* A team's own room: its members (and hosts) can restyle it (188). */}
        {room.kind === 'team' && <HomebaseLookPanel room={room} />}
        <RoomSections context={sectionContext} />
      </div>
    </div>
  )
}
