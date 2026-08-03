import { Outlet } from 'react-router'
import { VenuePresenceProvider } from '../../contexts/VenuePresenceContext'

/**
 * Layout route for /events/virtual-hackathon/:slug and its room pages.
 *
 * Exists for exactly one reason: the presence channel must outlive page swaps.
 * The provider owns the venue session, the roster, and the single
 * `venue:{eventId}` channel; the floorplan and room pages read them from
 * context, so moving between them never tears the socket down.
 */
export default function EventVenueLayout() {
  return (
    <VenuePresenceProvider>
      <Outlet />
    </VenuePresenceProvider>
  )
}
