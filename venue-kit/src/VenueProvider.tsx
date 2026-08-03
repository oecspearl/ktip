import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { VENUE } from './constants'
import { useVenuePresence, type VenuePresence } from './useVenuePresence'
import type { VenueMember, VenueRoom } from './types'

/**
 * One presence channel per venue *visit*, not per page.
 *
 * Mount this in a layout that wraps the floorplan page AND every room page,
 * and pass the current room's key from your router. If each page mounts its
 * own provider instead, every navigation tears the socket down and rebuilds
 * it — auth, private-channel join, presence sync — and the UI reads
 * "Reconnecting…" at exactly the moment the user expects to see who is in
 * the room.
 */
export interface VenueProviderProps {
  client: SupabaseClient
  eventId: string
  /** Null while signed out; the venue stays dormant until a user exists. */
  user: { id: string; name: string | null; avatarUrl: string | null } | null
  /** The room key from the URL, or null on the floorplan. */
  roomKey: string | null
  children: ReactNode
}

export interface VenueContextValue {
  eventId: string
  /** Your membership row. Undefined while joining or when refused. */
  membership: VenueMember | undefined
  joining: boolean
  joinError: Error | null
  rooms: VenueRoom[]
  roomsLoading: boolean
  /** The room resolved from roomKey, once rooms load. */
  currentRoom: VenueRoom | null
  /** Cold-mirror roster; presence merges it automatically. */
  roster: VenueMember[]
  refreshRoster: () => void
  presence: VenuePresence
  /** Server-side room entry (capacity + closed-room checks). Throws with a readable message. */
  enterRoom: (roomId: string) => Promise<VenueRoom>
}

const VenueContext = createContext<VenueContextValue | null>(null)

export function VenueProvider({ client, eventId, user, roomKey, children }: VenueProviderProps) {
  const [membership, setMembership] = useState<VenueMember | undefined>(undefined)
  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState<Error | null>(null)
  const [rooms, setRooms] = useState<VenueRoom[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [roster, setRoster] = useState<VenueMember[]>([])

  const userId = user?.id

  // Enter the venue. join_venue is idempotent — it returns the existing row
  // and touches last_seen_at when already a member. The server assigns the
  // role; a refusal ("register for this event…") lands in joinError with the
  // server's own message, which is an answer for the UI, not a failure.
  useEffect(() => {
    if (!eventId || !userId) {
      setJoining(false)
      return
    }
    let cancelled = false
    setJoining(true)
    setJoinError(null)
    client
      .rpc('join_venue', { p_event_id: eventId })
      .then(({ data, error }: { data: unknown; error: { message?: string } | null }) => {
        if (cancelled) return
        if (error) setJoinError(new Error(error.message || 'Could not enter the venue'))
        else setMembership(data as VenueMember)
        setJoining(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, eventId, userId])

  // Rooms are near-static; one fetch per visit is enough. Re-fetch yourself
  // (or add a realtime subscription) if organizers edit rooms mid-event.
  useEffect(() => {
    if (!eventId || !membership) return
    let cancelled = false
    setRoomsLoading(true)
    client
      .from('venue_rooms')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order')
      .then(({ data }: { data: unknown }) => {
        if (cancelled) return
        setRooms((data as VenueRoom[]) || [])
        setRoomsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, eventId, membership])

  const fetchRoster = useCallback(() => {
    if (!eventId) return
    void client
      .from('venue_members')
      .select('*')
      .eq('event_id', eventId)
      .order('last_seen_at', { ascending: false })
      .then(({ data }: { data: unknown }) => {
        setRoster((data as VenueMember[]) || [])
      })
  }, [client, eventId])

  // The roster is the cold path: it exists for first paint and for members
  // with no live presence entry. Deliberately polled, not realtime — putting
  // venue_members in a realtime publication would fan out one event per
  // heartbeat per member.
  useEffect(() => {
    if (!membership) return
    fetchRoster()
    const interval = window.setInterval(fetchRoster, VENUE.ROSTER_REFETCH_MS)
    return () => window.clearInterval(interval)
  }, [membership, fetchRoster])

  // The current room is derived from the URL, so the presence payload flips
  // in the same render as the navigation — no handshake between page and
  // provider, nothing to get out of sync.
  const currentRoom = useMemo(
    () => (roomKey ? rooms.find((r) => r.key === roomKey) ?? null : null),
    [rooms, roomKey]
  )

  const me = useMemo(
    () =>
      membership && user
        ? {
            user_id: user.id,
            display_name: user.name,
            avatar_url: user.avatarUrl,
            role: membership.role,
          }
        : null,
    [membership, user]
  )

  const presence = useVenuePresence({
    client,
    eventId,
    me,
    roomId: currentRoom?.id ?? null,
    roster,
    onHeartbeat: fetchRoster,
  })

  const enterRoom = useCallback(
    async (roomId: string): Promise<VenueRoom> => {
      const { data, error } = await client.rpc('enter_venue_room', { p_room_id: roomId })
      if (error) throw new Error(error.message || 'Could not enter that room')
      return data as VenueRoom
    },
    [client]
  )

  const value = useMemo<VenueContextValue>(
    () => ({
      eventId,
      membership,
      joining,
      joinError,
      rooms,
      roomsLoading,
      currentRoom,
      roster,
      refreshRoster: fetchRoster,
      presence,
      enterRoom,
    }),
    [
      eventId,
      membership,
      joining,
      joinError,
      rooms,
      roomsLoading,
      currentRoom,
      roster,
      fetchRoster,
      presence,
      enterRoom,
    ]
  )

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
}

export function useVenue(): VenueContextValue {
  const ctx = useContext(VenueContext)
  if (!ctx) throw new Error('useVenue must be used inside <VenueProvider>')
  return ctx
}
