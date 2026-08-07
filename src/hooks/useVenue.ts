import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EventVenueMember, VenueRoomRole } from '../types'

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

/**
 * Per-room role overrides (109). No row for a (room, user) pair means their
 * venue-wide role applies there.
 */
export function useVenueRoomRoles(eventId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('venue', 'room-roles', eventId),
    queryFn: async (): Promise<VenueRoomRole[]> => {
      const { data, error } = await (supabase as any)
        .from('venue_room_roles')
        .select('*, user:profiles(id, display_name, avatar_url)')
        .eq('event_id', eventId)
      if (error) throw error
      return (data as VenueRoomRole[]) || []
    },
    enabled: !!eventId,
  })

  return { roomRoles: query.data, loading: query.isPending, error: query.error }
}

/**
 * Host-side: give somebody a role in one room, take it away again, or promote
 * it to the whole venue.
 */
export function useVenueRoomRoleAdmin() {
  const queryClient = useQueryClient()

  const refresh = (eventId: string) => {
    queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'room-roles', eventId) })
    queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'roster', eventId) })
  }

  /** Upsert, because changing somebody's role in a room is not a second row. */
  const setRoomRole = useMutation({
    mutationFn: async ({
      eventId,
      roomId,
      userId,
      role,
    }: {
      eventId: string
      roomId: string
      userId: string
      role: EventVenueMember['role']
    }) => {
      const { error } = await (supabase as any)
        .from('venue_room_roles')
        .upsert(
          { event_id: eventId, room_id: roomId, user_id: userId, role },
          { onConflict: 'room_id,user_id' }
        )
      if (error) throw error
    },
    onSuccess: (_d, v) => refresh(v.eventId),
  })

  const clearRoomRole = useMutation({
    mutationFn: async ({ eventId: _e, id }: { eventId: string; id: string }) => {
      const { error } = await (supabase as any).from('venue_room_roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => refresh(v.eventId),
  })

  /**
   * "Everywhere": write the role onto the roster row and drop every per-room
   * override this person has in the venue. Not a third state — a person with
   * no overrides is exactly the pre-109 arrangement, so the resolver never has
   * to know the difference.
   */
  const applyEverywhere = useMutation({
    mutationFn: async ({
      eventId,
      userId,
      role,
    }: {
      eventId: string
      userId: string
      role: EventVenueMember['role']
    }) => {
      const { error: roleError } = await (supabase as any)
        .from('event_venue_members')
        .update({ role })
        .eq('event_id', eventId)
        .eq('user_id', userId)
      if (roleError) throw roleError

      const { error } = await (supabase as any)
        .from('venue_room_roles')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: (_d, v) => refresh(v.eventId),
  })

  /**
   * "Only here": the mirror of applyEverywhere. Pin the role to this room and
   * take it away from every other — the override on other rooms goes, and the
   * venue-wide role drops to participant, which is what stops the role
   * surviving in every room that has no override of its own.
   *
   * The roster row itself stays: it is their membership, and deleting it would
   * throw them out of the venue rather than narrow what they are in it.
   */
  const scopeToRoom = useMutation({
    mutationFn: async ({
      eventId,
      roomId,
      userId,
      role,
    }: {
      eventId: string
      roomId: string
      userId: string
      role: EventVenueMember['role']
    }) => {
      const { error: upsertError } = await (supabase as any)
        .from('venue_room_roles')
        .upsert(
          { event_id: eventId, room_id: roomId, user_id: userId, role },
          { onConflict: 'room_id,user_id' }
        )
      if (upsertError) throw upsertError

      const { error: elsewhereError } = await (supabase as any)
        .from('venue_room_roles')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .neq('room_id', roomId)
      if (elsewhereError) throw elsewhereError

      const { error } = await (supabase as any)
        .from('event_venue_members')
        .update({ role: 'participant' })
        .eq('event_id', eventId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: (_d, v) => refresh(v.eventId),
  })

  return {
    setRoomRole: setRoomRole.mutateAsync,
    clearRoomRole: clearRoomRole.mutateAsync,
    applyEverywhere: applyEverywhere.mutateAsync,
    scopeToRoom: scopeToRoom.mutateAsync,
    loading:
      setRoomRole.isPending ||
      clearRoomRole.isPending ||
      applyEverywhere.isPending ||
      scopeToRoom.isPending,
  }
}

/**
 * Host-side: change someone's venue role, put someone on the roster before
 * they arrive, or remove them from the venue.
 */
export function useVenueRosterAdmin() {
  const queryClient = useQueryClient()

  /**
   * Give somebody a role before they have ever entered.
   *
   * join_venue() only assigns a role when it finds no row — an existing one is
   * returned untouched (096) — so a row written here survives the person
   * walking in, which is the whole point: a judge or a speaker cannot be
   * promoted from the roster until they are already standing in the venue, and
   * by then it is the day of the event.
   *
   * Allowed by the "Hosts can manage the venue roster" policy from 070, which
   * is FOR ALL and so covers the insert. Availability is 'offline' rather than
   * the column default: they are not here yet, and the roster should not claim
   * otherwise until presence says so.
   */
  const inviteMember = useMutation({
    mutationFn: async ({
      eventId,
      userId,
      role,
    }: {
      eventId: string
      userId: string
      role: EventVenueMember['role']
    }) => {
      const { error } = await (supabase as any)
        .from('event_venue_members')
        .insert({ event_id: eventId, user_id: userId, role, availability: 'offline' })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'roster', v.eventId) })
    },
  })

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
    inviteMember: inviteMember.mutateAsync,
    setRole: setRole.mutateAsync,
    removeMember: removeMember.mutateAsync,
    inviting: inviteMember.isPending,
    loading: setRole.isPending || removeMember.isPending,
    error: setRole.error || removeMember.error || inviteMember.error,
  }
}
