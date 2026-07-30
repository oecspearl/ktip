import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { VenueRoom } from '../types'

export function useVenueRooms(eventId: string | undefined) {
  const fetchRooms = async (id: string): Promise<VenueRoom[]> => {
    const { data, error } = await (supabase as any)
      .from('venue_rooms')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('venue', 'rooms', eventId),
    queryFn: () => fetchRooms(eventId as string),
    enabled: !!eventId,
  })

  return { rooms: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useVenueRoom(roomId: string | undefined) {
  const fetchRoom = async (id: string): Promise<VenueRoom | null> => {
    const { data, error } = await (supabase as any)
      .from('venue_rooms')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return (data as any) || null
  }

  const query = useQuery({
    queryKey: keys.sub('venue', 'room', roomId),
    queryFn: () => fetchRoom(roomId as string),
    enabled: !!roomId,
  })

  return { room: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * Enter a room. Goes through the RPC rather than a direct UPDATE because the
 * RPC is what checks membership, that the room is open, and capacity — and
 * because capacity is advisory (it counts the cold mirror), letting the server
 * own that judgement keeps the rule in one place.
 */
export function useEnterVenueRoom() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ roomId, eventId: _eventId }: { roomId: string; eventId: string }) => {
      const { data, error } = await (supabase as any).rpc('enter_venue_room', {
        p_room_id: roomId,
      })
      if (error) throw error
      return data as VenueRoom
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'occupancy', variables.eventId) })
    },
  })

  const enterRoom = (eventId: string, roomId: string) => mutation.mutateAsync({ roomId, eventId })

  return { enterRoom, loading: mutation.isPending, error: mutation.error }
}

/** Host-side room authoring, used by AdminEventVenueTab. */
export function useVenueRoomMutations() {
  const queryClient = useQueryClient()

  const invalidate = (eventId: string) => {
    queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'rooms', eventId) })
  }

  const createRoom = useMutation({
    mutationFn: async (
      room: Pick<VenueRoom, 'event_id' | 'key' | 'name' | 'kind'> & Partial<VenueRoom>
    ) => {
      const { data, error } = await (supabase as any)
        .from('venue_rooms')
        .insert(room)
        .select()
        .single()
      if (error) throw error
      return data as VenueRoom
    },
    onSuccess: (_d, v) => invalidate(v.event_id),
  })

  const updateRoom = useMutation({
    mutationFn: async ({
      roomId,
      eventId: _eventId,
      updates,
    }: {
      roomId: string
      eventId: string
      updates: Partial<VenueRoom>
    }) => {
      const { data, error } = await (supabase as any)
        .from('venue_rooms')
        .update(updates)
        .eq('id', roomId)
        .select()
        .single()
      if (error) throw error
      return data as VenueRoom
    },
    onSuccess: (_d, v) => invalidate(v.eventId),
  })

  const deleteRoom = useMutation({
    mutationFn: async ({ roomId, eventId: _eventId }: { roomId: string; eventId: string }) => {
      const { error } = await (supabase as any).from('venue_rooms').delete().eq('id', roomId)
      if (error) throw error
    },
    onSuccess: (_d, v) => invalidate(v.eventId),
  })

  /**
   * One click instead of authoring six rows. Skips keys that already exist, so
   * a host who renamed Main Hall keeps their version.
   */
  const seedDefaults = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await (supabase as any).rpc('seed_default_venue_rooms', {
        p_event_id: eventId,
      })
      if (error) throw error
      return (data as any[]) as VenueRoom[]
    },
    onSuccess: (_d, eventId) => invalidate(eventId),
  })

  return {
    createRoom: createRoom.mutateAsync,
    updateRoom: updateRoom.mutateAsync,
    deleteRoom: deleteRoom.mutateAsync,
    seedDefaults: seedDefaults.mutateAsync,
    loading:
      createRoom.isPending ||
      updateRoom.isPending ||
      deleteRoom.isPending ||
      seedDefaults.isPending,
    error: createRoom.error || updateRoom.error || deleteRoom.error || seedDefaults.error,
  }
}
