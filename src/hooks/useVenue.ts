import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EventVenueMember } from '../types'

/**
 * Enter the venue and get your own membership row.
 *
 * `join_venue` is used as the *fetch* rather than a mutation because it is
 * idempotent by design — it returns the existing row and touches last_seen_at
 * if you are already a member, and only inserts on a genuine first entry. That
 * makes "am I in this venue, and as what" one round trip instead of two.
 *
 * The RPC decides your role from the event and your RSVP; the client never
 * asks for one. It raises when you are not registered, so retries are off:
 * "register for this event to enter the venue" is an answer, not a failure.
 */
export function useVenueSession(eventId: string | undefined) {
  const join = async (id: string): Promise<EventVenueMember> => {
    const { data, error } = await (supabase as any).rpc('join_venue', { p_event_id: id })
    if (error) throw error
    return data as EventVenueMember
  }

  const query = useQuery({
    queryKey: keys.sub('venue', 'membership', eventId),
    queryFn: () => join(eventId as string),
    enabled: !!eventId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  return {
    membership: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * The roster. This is the cold path — the floorplan gets its live numbers from
 * the presence channel, and this exists for first paint, for members with no
 * presence entry, and for the directory-style panels (who is here, who is
 * looking for a team).
 */
export function useVenueRoster(eventId: string | undefined) {
  const fetchRoster = async (id: string): Promise<EventVenueMember[]> => {
    const { data, error } = await (supabase as any)
      .from('event_venue_members')
      .select('*, user:profiles(id, display_name, avatar_url, roles, organization, skills)')
      .eq('event_id', id)
      .order('last_seen_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('venue', 'roster', eventId),
    queryFn: () => fetchRoster(eventId as string),
    enabled: !!eventId,
    // Deliberately not realtime: event_venue_members is not in the publication,
    // because publishing it would fan out a WAL event per heartbeat per member.
    refetchInterval: 60_000,
  })

  return { roster: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Members who ticked "looking for a team", for the discovery panel. */
export function useVenueDiscoverable(eventId: string | undefined) {
  const { roster, loading, error } = useVenueRoster(eventId)
  const discoverable = (roster || []).filter(
    (m) => m.is_discoverable && m.looking_for_team && m.role === 'participant'
  )
  return { discoverable, loading, error }
}

/**
 * Your own venue row: availability, status note, skills, discoverability.
 *
 * Role is not updatable here even though the policy allows a self-update — a
 * trigger silently restores it for anyone who is not the host, so sending one
 * would look like it worked and then not have.
 */
export function useUpdateVenueProfile() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      eventId,
      updates,
    }: {
      eventId: string
      updates: Partial<
        Pick<
          EventVenueMember,
          'availability' | 'status_note' | 'skills' | 'looking_for_team' | 'is_discoverable'
        >
      >
    }) => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) throw new Error(t`Not signed in`)

      const { data, error } = await (supabase as any)
        .from('event_venue_members')
        .update(updates)
        .eq('event_id', eventId)
        .eq('user_id', uid)
        .select()
        .single()

      if (error) throw error
      return data as EventVenueMember
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'membership', variables.eventId) })
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'roster', variables.eventId) })
    },
  })

  const updateVenueProfile = (
    eventId: string,
    updates: Parameters<typeof mutation.mutateAsync>[0]['updates']
  ) => mutation.mutateAsync({ eventId, updates })

  return { updateVenueProfile, loading: mutation.isPending, error: mutation.error }
}

/**
 * Cold-path occupancy, for first paint before the presence channel syncs and
 * for the organizer view. Live occupancy is a client-side groupBy over presence
 * state and does not come from here.
 */
export function useVenueOccupancyFallback(eventId: string | undefined) {
  const fetchOccupancy = async (id: string): Promise<Record<string, number>> => {
    const { data, error } = await (supabase as any).rpc('venue_room_occupancy', {
      p_event_id: id,
    })
    if (error) throw error
    const out: Record<string, number> = {}
    for (const row of (data as any[]) || []) out[row.room_id] = row.occupants
    return out
  }

  const query = useQuery({
    queryKey: keys.sub('venue', 'occupancy', eventId),
    queryFn: () => fetchOccupancy(eventId as string),
    enabled: !!eventId,
    refetchInterval: 60_000,
  })

  return { occupancy: query.data, loading: query.isPending, error: query.error }
}

/** Host-side: change someone's venue role, or remove them from the venue. */
export function useVenueRosterAdmin() {
  const queryClient = useQueryClient()

  const setRole = useMutation({
    mutationFn: async ({
      memberId,
      eventId: _eventId,
      role,
    }: {
      memberId: string
      eventId: string
      role: EventVenueMember['role']
    }) => {
      const { error } = await (supabase as any)
        .from('event_venue_members')
        .update({ role })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'roster', v.eventId) })
    },
  })

  const removeMember = useMutation({
    mutationFn: async ({ memberId, eventId: _eventId }: { memberId: string; eventId: string }) => {
      const { error } = await (supabase as any)
        .from('event_venue_members')
        .delete()
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'roster', v.eventId) })
    },
  })

  return {
    setRole: setRole.mutateAsync,
    removeMember: removeMember.mutateAsync,
    loading: setRole.isPending || removeMember.isPending,
    error: setRole.error || removeMember.error,
  }
}
