import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Lock } from 'lucide-react'
import { useEvent } from '../../hooks/useEvents'
import { useVenueRoster, useVenueSession } from '../../hooks/useVenue'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { venuePath } from '../../lib/event-slug'
import { useVenuePresence } from '../../hooks/useVenuePresence'
import { useRoomSignals } from '../../hooks/useRoomSignals'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueTopBar } from '../../components/venue/VenueTopBar'
import { RoomSections } from '../../components/venue/room/RoomSections'
import type { RoomSectionContext } from '../../components/venue/room/RoomSections'
import { Button } from '../../components/ui/Button'
import { occupantsInRoom } from '../../lib/venue-presence'
import { roomUsesSignals } from '../../lib/venue-room-sections'
import {
  VENUE_ROOM_KIND_ICONS,
  VENUE_ROOM_KIND_LABELS,
} from '../../lib/constants'
import { resolveIcon } from '../../lib/icon-map'
import { entityPath } from '../../lib/slug'

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
  const { membership, loading: joinPending, error: joinError } = useVenueSession(eventId)
  const joining = !!eventId && joinPending
  const { roster } = useVenueRoster(eventId)

  usePageTitle(room ? `${room.name} — ${event?.title ?? 'Venue'}` : 'Venue room')

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

  const presence = useVenuePresence({
    eventId,
    me,
    roomId: roomId ?? null,
    roster,
  })

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
      ? { userId: me.user_id, name: me.display_name || 'Member', avatarUrl: me.avatar_url }
      : null,
    // Only when a panel on this room actually uses it. Most rooms have neither
    // reactions nor a hand queue, and an unused private channel is an auth
    // round trip plus a rejoin on every reconnect for nothing.
    enabled:
      !!room &&
      room.is_open &&
      room.kind !== 'team' &&
      !!membership &&
      roomUsesSignals(room, membership.role),
  })

  // Leaving the page puts you back on the floorplan rather than leaving a ghost
  // in the room. The presence payload updates via the roomId prop; this only
  // has to clear the cold mirror on the way out.
  useEffect(() => {
    return () => {
      // Fire-and-forget: a missed clear ages out of the mirror within 2 minutes.
    }
  }, [])

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
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">Room not found</h1>
        <Link
          to={event ? venuePath(event) : '/events'}
          className="mt-3 inline-block text-ktip-ocean-600 hover:underline"
        >
          Back to the map
        </Link>
      </div>
    )
  }

  if (joinError || !membership) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          You are not in this venue
        </h1>
        <p className="mt-2 text-ktip-sand-600">
          {(joinError as any)?.message || 'Register for this event to enter the venue.'}
        </p>
        <Link to={entityPath('event', event)} className="mt-5 inline-block">
          <Button>Go to the event page</Button>
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
    signals,
  }

  return (
    // pt clears the fixed navbar — see the note on EventVenuePage.
    <div className="min-h-screen bg-ktip-canvas pb-12 pt-[var(--nav-h)]">
      <VenueTopBar
        eventId={event.id}
        eventSlug={event.slug}
        eventTitle={event.title}
        role={membership.role}
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
            </p>
            <h1 className="font-display text-2xl font-bold text-ktip-sand-900">{room.name}</h1>
            {room.description && (
              <p className="mt-1 text-sm text-ktip-sand-600">{room.description}</p>
            )}
          </div>
          {!room.is_open && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-ktip-sand-200 bg-ktip-sand-100 px-3 py-1 text-xs font-medium text-ktip-sand-600">
              <Lock size={12} aria-hidden="true" /> Closed
            </span>
          )}
        </div>

        {/*
          What a room contains is data, not layout: venue_rooms.sections, or the
          default set for its kind. Adding a panel is a registry entry plus a
          case in RoomSections — never a branch here.
        */}
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <RoomSections slot="main" context={sectionContext} className="space-y-6" />
          <aside>
            <RoomSections slot="aside" context={sectionContext} className="space-y-4" />
          </aside>
        </div>
      </div>
    </div>
  )
}
