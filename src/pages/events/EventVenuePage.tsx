import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Info, Map as MapIcon, Sparkles } from 'lucide-react'
import { useEvent } from '../../hooks/useEvents'
import { venueRoomPath } from '../../lib/event-slug'
import { useVenueRoster, useVenueSession } from '../../hooks/useVenue'
import { useEnterVenueRoom, useVenueRooms } from '../../hooks/useVenueRooms'
import { useVenuePresence } from '../../hooks/useVenuePresence'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueTopBar } from '../../components/venue/VenueTopBar'
import { VenueFloorplan } from '../../components/venue/VenueFloorplan'
import { RoomOccupantList } from '../../components/venue/RoomOccupantList'
import { Button } from '../../components/ui/Button'
import { occupantsUnassigned } from '../../lib/venue-presence'
import type { VenueRoom } from '../../types'
import { entityPath } from '../../lib/slug'

/**
 * The venue floorplan — the front door of a virtual hackathon.
 *
 * Everything live on this page comes from one presence channel. Room occupancy
 * is a client-side reduction over the complete presence state rather than a
 * subscription per room, which is why nine rooms cost one socket.
 */
export default function EventVenuePage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  // Addressed by slug — /events/virtual-hackathon/<slug> — so the id only
  // exists once the event has resolved. useEvent takes either shape.
  const { event, loading: eventLoading } = useEvent(params.slug)
  const eventId = event?.id
  usePageTitle(event ? `Venue — ${event.title}` : 'Venue')

  // A disabled query reports isPending forever, so an unresolvable slug would
  // sit on the skeleton instead of reaching the "not found" branch below.
  const { membership, loading: joinPending, error: joinError } = useVenueSession(eventId)
  const joining = !!eventId && joinPending
  const { rooms, loading: roomsLoading } = useVenueRooms(eventId)
  const { roster } = useVenueRoster(eventId)
  const { enterRoom } = useEnterVenueRoom()

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
    // On the floorplan you are in the venue but not in a room.
    roomId: null,
    roster,
  })

  const lobby = useMemo(() => occupantsUnassigned(presence.occupants), [presence.occupants])
  const headcount = presence.occupants.filter((o) => o.availability !== 'offline').length

  const handleEnter = async (room: VenueRoom) => {
    if (!eventId || !event) return
    try {
      await enterRoom(eventId, room.id)
      navigate(venueRoomPath(event, room.key))
    } catch (err: any) {
      toast.error(err?.message || 'Could not enter that room')
    }
  }

  if (eventLoading || joining) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
        <div className="h-14 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">Event not found</h1>
        <Link to="/events" className="mt-3 inline-block text-ktip-ocean-600 hover:underline">
          Browse events
        </Link>
      </div>
    )
  }

  if (!event.has_venue) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <MapIcon size={32} className="mx-auto mb-3 text-ktip-sand-400" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          This event has no virtual venue
        </h1>
        <p className="mt-2 text-ktip-sand-600">
          The organizer has not turned one on. Everything about the event is on its main page.
        </p>
        <Link
          to={entityPath('event', event)}
          className="mt-4 inline-block text-ktip-ocean-600 hover:underline"
        >
          Go to {event.title}
        </Link>
      </div>
    )
  }

  // join_venue raises rather than returning null — "register first" is an
  // answer, not a failure, so it is rendered as one.
  if (joinError || !membership) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          You are not in this venue yet
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

  return (
    // pt clears the fixed navbar: this page has no PageHero, so without it the
    // sticky VenueTopBar (and its back link) renders underneath the bar and the
    // click lands on the navbar logo instead.
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
      />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ktip-ocean-600">
            Virtual venue
          </p>
          <h1 className="font-display text-2xl font-bold text-ktip-sand-900 md:text-3xl">
            {event.title}
          </h1>
          <p className="mt-1 text-sm text-ktip-sand-600">
            Pick a room to join it. Everyone in a room can see who else is there.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div data-tutorial="venue-floorplan">
            {roomsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-40 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
                ))}
              </div>
            ) : !rooms || rooms.length === 0 ? (
              <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-8 text-center">
                <MapIcon size={28} className="mx-auto mb-3 text-ktip-sand-400" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-ktip-sand-900">
                  The venue has no rooms yet
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-ktip-sand-600">
                  {membership.role === 'organizer'
                    ? 'Open the Venue tab on the admin page for this event and create the rooms — there is a one-click starter set.'
                    : 'The organizer is still setting up. Check back shortly.'}
                </p>
                {membership.role === 'organizer' && (
                  <Link to={`/admin/events/${event.id}`} className="mt-4 inline-block">
                    <Button size="sm" icon={<Sparkles size={15} />}>
                      Set up the venue
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <VenueFloorplan
                rooms={rooms}
                occupants={presence.occupants}
                currentRoomId={null}
                floorplanUrl={event.venue_floorplan_url}
                onEnter={handleEnter}
              />
            )}
          </div>

          <aside data-tutorial="venue-presence" className="space-y-4">
            <RoomOccupantList
              occupants={lobby}
              title="In the venue"
              emptyLabel="Everyone is inside a room."
            />

            <div className="flex items-start gap-2 rounded-2xl border border-ktip-ocean-100 bg-ktip-ocean-50 p-3 text-xs text-ktip-ocean-800">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                Your dot turns grey automatically after five minutes in a background tab. Set
                “Do not disturb” and it stays put.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
