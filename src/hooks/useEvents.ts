import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import type { DetailEntry, Event } from '../types'

export function useEvents(filters?: {
  type?: string
  upcoming?: boolean
  search?: string
  status?: string
  climateAction?: boolean
  dateRange?: { start: string; end: string }
  tags?: string[]
}) {
  // Sorted so ['ai','climate'] and ['climate','ai'] share one cache entry.
  const tags = filters?.tags?.length
    ? [...filters.tags].map(sanitizeTag).filter(Boolean).sort()
    : undefined
  const normalized = { ...filters, tags }

  const fetchEvents = async (): Promise<Event[]> => {
    let query = supabase
      .from('events')
      .select(`
        *,
        organizer:profiles(*)
      `)
      .order('start_date', { ascending: true })

    // Exclude drafts from public listing by default
    if (filters?.status) {
      query = query.eq('status', filters.status as any)
    } else {
      query = query.neq('status', 'draft' as any)
    }

    // Date window (calendar month view) — supersedes the upcoming filter
    if (filters?.dateRange) {
      query = query
        .gte('start_date', filters.dateRange.start)
        .lte('start_date', filters.dateRange.end)
    } else if (filters?.upcoming) {
      const now = new Date().toISOString()
      query = query.gte('start_date', now)
    }

    // Filter by event type
    if (filters?.type) {
      query = query.eq('event_type', filters.type as any)
    }

    // Climate action filter
    if (filters?.climateAction) {
      query = query.eq('is_climate_action', true)
    }

    // Tag filter — "any of"; AND semantics would empty the list on the second chip
    if (tags?.length) {
      query = query.overlaps('tags', tags)
    }

    // Search filter
    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%,description.ilike.%${sanitized}%,tags_text.ilike.%${sanitized}%`
        )
      }
    }

    query = query.limit(filters?.dateRange ? 100 : 50)

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('events', normalized),
    queryFn: fetchEvents,
  })

  return { events: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useEvent(id: string | undefined) {
  const fetchEvent = async (eventId: string): Promise<Event | null> => {
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        organizer:profiles(*)
      `)
      .eq('id', eventId)
      .single()

    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('events', id),
    queryFn: () => fetchEvent(id as string),
    enabled: !!id,
  })

  return { event: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateEvent() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (eventData: {
      title: string
      summary?: string | null
      tags?: string[]
      description?: string
      event_type: string
      location?: string
      is_virtual?: boolean
      start_date: string
      end_date?: string
      capacity?: number
      organizer_id: string
      is_climate_action?: boolean
      details?: DetailEntry[]
    }) => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          ...eventData,
          event_type: eventData.event_type as any,
          is_virtual: eventData.is_virtual ?? false,
          status: 'draft' as any,
        } as any)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('events') })
    },
  })

  return { createEvent: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateEvent() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      eventId,
      updates,
    }: {
      eventId: string
      updates: Partial<Event>
    }) => {
      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', eventId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('events') })
    },
  })

  const updateEvent = (eventId: string, updates: Partial<Event>) =>
    mutation.mutateAsync({ eventId, updates })

  return { updateEvent, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteEvent() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from('events').delete().eq('id', eventId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('events') })
    },
  })

  return { deleteEvent: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useRSVP() {
  const queryClient = useQueryClient()

  const rsvpMutation = useMutation({
    mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) => {
      const { data, error } = await supabase
        .from('event_rsvps')
        .insert({
          event_id: eventId,
          user_id: userId,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'rsvp', variables.eventId) })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) => {
      const { error } = await supabase
        .from('event_rsvps')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'rsvp', variables.eventId) })
    },
  })

  const rsvp = (eventId: string, userId: string) => rsvpMutation.mutateAsync({ eventId, userId })
  const cancelRSVP = (eventId: string, userId: string) => cancelMutation.mutateAsync({ eventId, userId })

  const checkRSVP = async (eventId: string, userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return !!data
  }

  const getRSVPCount = async (eventId: string): Promise<number> => {
    const { count, error } = await supabase
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)

    if (error) throw error
    return count || 0
  }

  return {
    rsvp,
    cancelRSVP,
    checkRSVP,
    getRSVPCount,
    loading: rsvpMutation.isPending || cancelMutation.isPending,
    error: rsvpMutation.error || cancelMutation.error,
  }
}
