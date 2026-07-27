import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Event } from '../types'

export function useEvents(filters?: {
  type?: string
  upcoming?: boolean
  search?: string
  status?: string
  climateAction?: boolean
}) {
  // Reactive source: serializes filter values so createResource refetches when they change
  const filterKey = () => JSON.stringify({
    type: filters?.type,
    upcoming: filters?.upcoming,
    search: filters?.search,
    status: filters?.status,
    climateAction: filters?.climateAction,
  })

  const fetchEvents = async (_key: string): Promise<Event[]> => {
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

    // Filter by upcoming events
    if (filters?.upcoming) {
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

    // Search filter
    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`
        )
      }
    }

    query = query.limit(50)

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const [events, { refetch }] = createResource(filterKey, fetchEvents)

  return { events, refetch }
}

export function useEvent(id: () => string | undefined) {
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

  const [event, { refetch }] = createResource(id, fetchEvent)

  return { event, refetch }
}

export function useCreateEvent() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createEvent = async (eventData: {
    title: string
    description?: string
    event_type: string
    location?: string
    is_virtual?: boolean
    start_date: string
    end_date?: string
    capacity?: number
    organizer_id: string
  }) => {
    setLoading(true)
    setError(null)

    try {
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
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createEvent, loading, error }
}

export function useUpdateEvent() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateEvent = async (eventId: string, updates: Partial<Event>) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', eventId)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateEvent, loading, error }
}

export function useDeleteEvent() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteEvent = async (eventId: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteEvent, loading, error }
}

export function useRSVP() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const rsvp = async (eventId: string, userId: string) => {
    setLoading(true)
    setError(null)

    try {
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
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const cancelRSVP = async (eventId: string, userId: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('event_rsvps')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const checkRSVP = async (
    eventId: string,
    userId: string
  ): Promise<boolean> => {
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

  return { rsvp, cancelRSVP, checkRSVP, getRSVPCount, loading, error }
}
