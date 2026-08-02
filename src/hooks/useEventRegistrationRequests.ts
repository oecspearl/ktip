import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { announceRegistrationDecision } from '../lib/event-registration'
import type { EventRSVP } from '../types'

/**
 * The organizer's side of a registration (096).
 *
 * Mirrors useProjectJoinRequests: a pending row is read here, and the decision
 * goes through a SECURITY DEFINER RPC that flips the status and re-checks the
 * participant cap together. Nothing in this file can grant a seat on its own.
 *
 * One difference from the project version: event_rsvps has a `USING (TRUE)`
 * SELECT policy — attendee lists are public — so RLS does not scope the inbox
 * for us. The `events!inner` filter on organizer_id is what does, and it has to
 * stay an inner join or the query returns every pending registration on the
 * platform.
 */

const DOMAIN = 'events'

const SELECT_WITH_CONTEXT = '*, user:profiles!user_id(*), event:events!inner(*)'

/** Pending registrations on one event — the Registrations tab. */
export function usePendingEventRegistrations(eventId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'pending-registrations', eventId),
    queryFn: async (): Promise<EventRSVP[]> => {
      const { data, error } = await (supabase as any)
        .from('event_rsvps')
        .select(SELECT_WITH_CONTEXT)
        .eq('event_id', eventId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as EventRSVP[]) || []
    },
    enabled: !!eventId,
  })

  return { registrations: query.data, loading: query.isPending, error: query.error }
}

/** Every pending registration across every event I organize — /invitations. */
export function useIncomingEventRegistrations(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub(DOMAIN, 'incoming-registrations', userId),
    queryFn: async (): Promise<EventRSVP[]> => {
      const { data, error } = await (supabase as any)
        .from('event_rsvps')
        .select(SELECT_WITH_CONTEXT)
        .eq('status', 'pending')
        .eq('event.organizer_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as EventRSVP[]) || []
    },
    enabled: !!userId,
  })

  return {
    registrations: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useEventRegistrationDecision() {
  const queryClient = useQueryClient()

  const decide = useMutation({
    mutationFn: async (params: {
      rsvpId: string
      approve: boolean
      registrantId: string
      eventId: string
      eventTitle: string
    }) => {
      const { error } = await (supabase as any).rpc('decide_event_registration', {
        p_rsvp_id: params.rsvpId,
        p_approve: params.approve,
      })
      if (error) throw error

      announceRegistrationDecision({
        registrantId: params.registrantId,
        eventId: params.eventId,
        eventTitle: params.eventTitle,
        approve: params.approve,
      })
    },
    onSuccess: () => {
      // The decision moves a row between the pending list, the registrations
      // table and the attendee count, so the whole domain is invalidated.
      queryClient.invalidateQueries({ queryKey: keys.all(DOMAIN) })
    },
  })

  return { decideRegistration: decide.mutateAsync, deciding: decide.isPending, error: decide.error }
}
