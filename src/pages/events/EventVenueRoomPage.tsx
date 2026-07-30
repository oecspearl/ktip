import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { Lock, Video } from 'lucide-react'
import { useEvent } from '../../hooks/useEvents'
import { useVenueRoster, useVenueSession } from '../../hooks/useVenue'
import { useVenueRoom } from '../../hooks/useVenueRooms'
import { useVenuePresence } from '../../hooks/useVenuePresence'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueTopBar } from '../../components/venue/VenueTopBar'
import { RoomOccupantList } from '../../components/venue/RoomOccupantList'
import { RoomChatPanel } from '../../components/venue/RoomChatPanel'
import { Button } from '../../components/ui/Button'
import { occupantsInRoom } from '../../lib/venue-presence'
import {
  VENUE_ROOM_KIND_ICONS,
  VENUE_ROOM_KIND_LABELS,
} from '../../lib/constants'
import { resolveIcon } from '../../lib/icon-map'

/**
 * Inside one room.
 *
 * Presence still comes from the single venue channel — being "in" a room is a
 * field on the tracked payload, not a separate subscription. The only per-room
 * subscription is chat, and it exists only while this page is mounted.
 *
 * Audio and video land in Phase 2 (LiveKit). The placeholder below is
 * deliberate: it says what is coming rather than pretending the room is silent
 * by design.
 */
export default function EventVenueRoomPage() {
  const params = useParams()
  const auth = useAuth()

  const eventId = params.id
  const roomId = params.roomId

  const { event, loading: eventLoading } = useEvent(eventId)
  const { room, loading: roomLoading } = useVenueRoom(roomId)
  const { membership, loading: joining, error: joinError } = useVenueSession(eventId)
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
          to={eventId ? `/events/${eventId}/venue` : '/events'}
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
        <Link to={`/events/${event.id}`} className="mt-5 inline-block">
          <Button>Go to the event page</Button>
        </Link>
      </div>
    )
  }

  const Icon = resolveIcon(VENUE_ROOM_KIND_ICONS[room.kind])
  const isHost = membership.role === 'organizer'
  const canPost = membership.role !== 'spectator'
  const headcount = presence.occupants.filter((o) => o.availability !== 'offline').length

  return (
    // pt clears the fixed navbar — see the note on EventVenuePage.
    <div className="min-h-screen bg-ktip-canvas pb-12 pt-[var(--nav-h)]">
      <VenueTopBar
        eventId={event.id}
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

        {room.sponsor_name && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-ktip-sun-200 bg-ktip-sun-50 p-3">
            {room.sponsor_logo_url && (
              <img
                src={room.sponsor_logo_url}
                alt=""
                className="h-9 w-9 rounded-lg object-contain"
              />
            )}
            <p className="text-sm text-ktip-sun-800">
              Hosted by <strong>{room.sponsor_name}</strong>
              {room.sponsor_url && (
                <>
                  {' — '}
                  <a
                    href={room.sponsor_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    visit
                  </a>
                </>
              )}
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            {/*
              Phase 2 replaces this with a LiveKit room. Saying so is better than
              a silent empty box: a room with no audio looks broken otherwise.
            */}
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ktip-sand-200 bg-ktip-cream px-6 py-10 text-center">
              <Video size={26} className="text-ktip-sand-400" aria-hidden="true" />
              <p className="font-display text-base font-bold text-ktip-sand-800">
                Audio and video are coming to this room
              </p>
              <p className="max-w-md text-sm text-ktip-sand-600">
                Presence and chat are live now. Voice, screen sharing and host controls arrive with
                the next release. Until then, use the chat below and the member list on the right.
              </p>
            </div>

            <RoomChatPanel
              room={room}
              canPost={canPost && room.is_open}
              canModerate={isHost}
              className="h-[32rem]"
            />
          </div>

          <aside>
            <RoomOccupantList
              occupants={inRoom}
              title="In this room"
              emptyLabel="You are the first one here."
            />
          </aside>
        </div>
      </div>
    </div>
  )
}
