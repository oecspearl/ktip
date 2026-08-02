import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'

/**
 * The caller's own registration status for one event.
 *
 * Read directly rather than through useRSVP's checkRSVP, which answers only
 * "is there a row" — the check-in card has to tell confirmed from waitlisted
 * from already checked in, and offer a different thing in each case.
 */
export function useMyEventRsvp(eventId: string | undefined) {
  const auth = useAuth()
  const userId = auth.user?.id

  const query = useQuery({
    queryKey: keys.sub('events', 'my-rsvp', eventId ? `${eventId}:${userId}` : undefined),
    queryFn: async (): Promise<{ status: string } | null> => {
      const { data, error } = await supabase
        .from('event_rsvps')
        .select('status')
        .eq('event_id', eventId as string)
        .eq('user_id', userId as string)
        .maybeSingle()
      if (error) throw error
      return (data as any) || null
    },
    enabled: !!eventId && !!userId,
  })

  return { rsvp: query.data, loading: query.isPending, error: query.error }
}

/**
 * Check yourself in from inside the venue.
 *
 * Goes through venue_check_in() (091) rather than an update, because
 * event_rsvps has no self-update policy — only organizers and admins may write
 * a status, which is right for every transition except this one.
 */
export function useVenueCheckIn() {
  const auth = useAuth()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await (supabase as any).rpc('venue_check_in', {
        p_event_id: eventId,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({
        queryKey: keys.sub('events', 'my-rsvp', `${eventId}:${auth.user?.id}`),
      })
    },
  })

  return { checkIn: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/** Host-side: post a kind=system line into a room. See venue_room_broadcast(). */
export function useRoomBroadcast() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ roomId, body }: { roomId: string; body: string }) => {
      const { data, error } = await (supabase as any).rpc('venue_room_broadcast', {
        p_room_id: roomId,
        p_body: body,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'messages', v.roomId) })
    },
  })

  return { broadcast: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
