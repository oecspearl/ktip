import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Lock } from 'lucide-react'
import { useEvent } from '../../hooks/useEvents'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { venuePath } from '../../lib/event-slug'
import { useVenuePresenceContext } from '../../contexts/VenuePresenceContext'
import { useRoomSignals } from '../../hooks/useRoomSignals'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueTopBar } from '../../components/venue/VenueTopBar'
import { RoomSections } from '../../components/venue/room/RoomSections'
import type { RoomSectionContext } from '../../components/venue/room/RoomSections'
import { Button } from '../../components/ui/Button'
import { occupantsInRoom } from '../../lib/venue-presence'
import { roomUsesSignals } from '../../lib/venue-room-sections'
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
  // Already on the event row (089) and already fetched — the floors are what
  // let every panel that names another room say which level it is on.
  const mapConfig = useMemo(() => mapConfigOf(event), [event])
  // Session and presence come from the layout's provider — the channel was
  // already joined on the floorplan, and it derives this room from the URL,
  // so entering here is one track() rather than a fresh subscription.
  const { membership, joining, joinError, presence } = useVenuePresenceContext()

  const venueFallbackTitle = t`Venue`
  usePageTitle(room ? t`${room.name} — ${event?.title ?? venueFallbackTitle}` : t`Venue room`)

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
      room.kind !== 'team' &&
      !!membership &&
      (roomUsesSignals(room, membership.role) || roomUsesStage(room, membership.role)),
  })

  if (eventLoading || roomLoading || joining) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
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

  const Icon = resolveIcon(VENUE_ROOM_KIND_ICONS[room.kind])
  const isHost = membership.role === 'organizer'
  const headcount = presence.occupants.filter((o) => o.availability !== 'offline').length

  const sectionContext: RoomSectionContext = {
    event,
    room,
    rooms,
    occupants: presence.occupants,
    inRoom,
    viewerRole: membership.role,
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
    <div className="min-h-screen bg-ktip-canvas pb-12 pt-[var(--nav-h)]">
      <VenueTopBar
        eventId={event.id}
        eventSlug={event.slug}
        eventTitle={event.title}
        headcount={headcount}
        connected={presence.connected}
        availability={presence.availability}
        isAuto={presence.manual === null || presence.manual !== presence.availability}
        onAvailabilityChange={presence.setAvailability}
        backToMap
      />

      <div className="mx-auto max-w-7xl px-4 py-6">
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
        <RoomSections context={sectionContext} />
      </div>
    </div>
  )
}
