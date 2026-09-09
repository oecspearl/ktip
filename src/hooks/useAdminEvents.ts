import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import { measuredCount, unavailable, type Measured } from '../lib/measured'
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

export interface AdminEventCounts {
  total: Measured
  published: Measured
  drafts: Measured
  upcoming: Measured
}

/**
 * The four figures on the events page header, counted by the database.
 *
 * They used to be `.filter().length` over whatever page of events had loaded,
 * so "Total Events" was really "events matching the current filter that fit in
 * one response". A head count is the number; a failed count is an em dash,
 * never a zero (src/lib/measured.ts).
 */
export function useAdminEventCounts() {
  const query = useQuery({
    queryKey: keys.list('admin-event-counts'),
    queryFn: async (): Promise<AdminEventCounts> => {
      const guarded = (promise: PromiseLike<{ count: number | null; error: unknown }>, label: string) =>
        Promise.resolve(promise).then(
          (r) => measuredCount(r, `${label} count failed`),
          () => unavailable(`${label} count failed`),
        )
      const now = new Date().toISOString()
      const head = () => supabase.from('events').select('*', { count: 'exact', head: true })

      const [total, published, drafts, upcoming] = await Promise.all([
        guarded(head(), 'events'),
        guarded(head().eq('status', 'published'), 'published events'),
        guarded(head().eq('status', 'draft'), 'draft events'),
        // An event is upcoming until it ends; one with no end date, until it starts.
        guarded(
          head()
            .in('status', ['published', 'draft'])
            .or(`end_date.gte.${now},and(end_date.is.null,start_date.gte.${now})`),
          'upcoming events',
        ),
      ])
      return { total, published, drafts, upcoming }
    },
    staleTime: 60 * 1000,
  })

  return { counts: query.data, loading: query.isPending }
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
