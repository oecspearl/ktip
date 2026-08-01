import { Navigate, useParams } from 'react-router'
import { useEvent } from '../../hooks/useEvents'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { venuePath, venueRoomPath } from '../../lib/event-slug'

/**
 * Keeps the old id-shaped venue URLs alive.
 *
 * /events/<uuid>/venue                  → /events/virtual-hackathon/<slug>
 * /events/<uuid>/venue/room/<room uuid> → …/<slug>/room/<room key>
 *
 * Links to the venue were uuid-shaped for the whole of migration 070's life, so
 * they are in bookmarks, chat logs and the seeded tutorial copy. Replacing the
 * route without this would 404 all of them.
 */
export default function VenueRedirectPage() {
  const params = useParams()
  const { event, loading } = useEvent(params.id)
  // Only needed for the room arm. A disabled query stays isPending, so the
  // flag has to be gated on the arm being taken at all.
  const { rooms, loading: roomsPending } = useVenueRooms(params.roomId ? params.id : undefined)
  const roomsLoading = !!params.roomId && roomsPending

  if (loading || roomsLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
        <div className="h-14 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  if (!event) return <Navigate to="/events" replace />

  if (params.roomId) {
    const room = rooms?.find((r) => r.id === params.roomId)
    // An unknown room id lands on the floorplan rather than a dead end.
    return (
      <Navigate
        to={room ? venueRoomPath(event, room.key) : venuePath(event)}
        replace
      />
    )
  }

  return <Navigate to={venuePath(event)} replace />
}
