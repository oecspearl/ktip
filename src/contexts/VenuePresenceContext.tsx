import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useMatch, useParams } from 'react-router'
import { useAuth } from './AuthContext'
import { useEvent } from '../hooks/useEvents'
import { useVenueRoster, useVenueSession } from '../hooks/useVenue'
import { useVenueRooms } from '../hooks/useVenueRooms'
import { useVenuePresence } from '../hooks/useVenuePresence'
import type { EventVenueMember } from '../types'

/**
 * One presence channel per venue *visit*, not per page.
 *
 * The floorplan and every room page used to each call useVenuePresence
 * themselves, so walking into a room unmounted one channel and built another
 * from zero — setAuth, a private-channel join with its RLS check, then the
 * presence sync — and the top bar sat on "Reconnecting" for the whole round
 * trip. Mounted once from EventVenueLayout, the channel survives navigation
 * and entering a room is a single `track()` on a socket that is already
 * joined.
 *
 * Which room this client is in is derived from the URL rather than pushed up
 * by the room page: the payload flips in the same render as the navigation,
 * with no mount-order handshake between page and provider.
 */
interface VenuePresenceContextValue {
  eventId: string | undefined
  membership: EventVenueMember | undefined
  /** True while join_venue is in flight for a resolved event. */
  joining: boolean
  joinError: unknown
  roster: EventVenueMember[] | undefined
  presence: ReturnType<typeof useVenuePresence>
}

const VenuePresenceContext = createContext<VenuePresenceContextValue | null>(null)

export function VenuePresenceProvider({ children }: { children: ReactNode }) {
  const params = useParams()
  const auth = useAuth()

  const { event } = useEvent(params.slug)
  const eventId = event?.id

  const { membership, loading: joinPending, error: joinError } = useVenueSession(eventId)
  const joining = !!eventId && joinPending
  const { roster } = useVenueRoster(eventId)
  const { rooms } = useVenueRooms(eventId)

  // The provider sits above the :roomKey route, so useParams cannot see the
  // room segment — match the room path explicitly instead.
  const roomMatch = useMatch('/events/virtual-hackathon/:slug/room/:roomKey')
  const roomId = useMemo(() => {
    const key = roomMatch?.params.roomKey
    if (!key) return null
    return rooms?.find((r) => r.key === key)?.id ?? null
  }, [roomMatch?.params.roomKey, rooms])

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

  const presence = useVenuePresence({ eventId, me, roomId, roster })

  const value = useMemo(
    () => ({ eventId, membership, joining, joinError, roster, presence }),
    // presence is a fresh object every render, so this memo keys on the
    // provider's own render — it exists to keep the value's shape stable for
    // TypeScript, not to skip renders.
    [eventId, membership, joining, joinError, roster, presence]
  )

  return <VenuePresenceContext.Provider value={value}>{children}</VenuePresenceContext.Provider>
}

export function useVenuePresenceContext(): VenuePresenceContextValue {
  const ctx = useContext(VenuePresenceContext)
  if (!ctx) {
    throw new Error('useVenuePresenceContext must be used inside EventVenueLayout')
  }
  return ctx
}
