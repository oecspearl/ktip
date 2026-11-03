import { Outlet } from 'react-router'
import { VenuePresenceProvider } from '../../contexts/VenuePresenceContext'
import { IrisTransitionProvider } from '../../components/ui/IrisTransition'

/**
 * Layout route for /events/virtual-hackathon/:slug and its room pages.
 *
 * Exists for exactly one reason: the presence channel must outlive page swaps.
 * The provider owns the venue session, the roster, and the single
 * `venue:{eventId}` channel; the floorplan and room pages read them from
 * context, so moving between them never tears the socket down.
 *
 * It also holds the iris that plays between the map and a room: the ring that
 * shuts on one page has to be the same element that opens on the other.
 */
export default function EventVenueLayout() {
  return (
    <VenuePresenceProvider>
      <IrisTransitionProvider>
        <Outlet />
      </IrisTransitionProvider>
    </VenuePresenceProvider>
  )
}
