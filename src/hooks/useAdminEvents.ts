import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { Event, EventRSVP, EventStatus, RSVPStatus } from '../types'

export function useAdminEvents(filters?: {
  status?: string
  type?: string
  search?: string
}) {
  const fetchEvents = async (): Promise<Event[]> => {
    let query = supabase
      .from('events')
      .select(`
        *,
        organizer:profiles(*)
      `)
      .order('start_date', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status as any)
    }

    if (filters?.type) {
      query = query.eq('event_type', filters.type as any)
    }

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
        )
      }
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('admin-events', filters),
    queryFn: fetchEvents,
  })

  return { events: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useEventStatusUpdate() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: EventStatus }) => {
      const { data, error } = await supabase
        .from('events')
        .update({ status: status as any })
        .eq('id', eventId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-events') })
      queryClient.invalidateQueries({ queryKey: keys.all('events') })
    },
  })

  const updateStatus = (eventId: string, status: EventStatus) =>
    mutation.mutateAsync({ eventId, status })

  return { updateStatus, loading: mutation.isPending, error: mutation.error }
}

export function useEventRegistrations(eventId: string | undefined) {
  const fetchRegistrations = async (id: string): Promise<EventRSVP[]> => {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select(`
        *,
        user:profiles(*)
      `)
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'registrations', eventId),
    queryFn: () => fetchRegistrations(eventId as string),
    enabled: !!eventId,
  })

  return { registrations: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useRegistrationActions() {
  const queryClient = useQueryClient()

  const updateStatusMutation = useMutation({
    mutationFn: async ({ rsvpId, status }: { rsvpId: string; status: RSVPStatus }) => {
      const { error } = await supabase
        .from('event_rsvps')
        .update({ status: status as any })
        .eq('id', rsvpId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'registrations') })
    },
  })

  const bulkCheckInMutation = useMutation({
    mutationFn: async (rsvpIds: string[]) => {
      const { error } = await supabase
        .from('event_rsvps')
        .update({ status: 'checked_in' as any })
        .in('id', rsvpIds)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'registrations') })
    },
  })

  const updateRSVPStatus = (rsvpId: string, status: RSVPStatus) =>
    updateStatusMutation.mutateAsync({ rsvpId, status })

  const bulkCheckIn = (rsvpIds: string[]) => bulkCheckInMutation.mutateAsync(rsvpIds)

  return {
    updateRSVPStatus,
    bulkCheckIn,
    loading: updateStatusMutation.isPending || bulkCheckInMutation.isPending,
    error: updateStatusMutation.error || bulkCheckInMutation.error,
  }
}
