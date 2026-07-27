import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Event, EventRSVP, EventStatus, RSVPStatus } from '../types'

export function useAdminEvents(filters?: {
  status?: string
  type?: string
  search?: string
}) {
  // Reactive source: serializes filter values so createResource refetches when they change
  const filterKey = () => JSON.stringify({
    status: filters?.status,
    type: filters?.type,
    search: filters?.search,
  })

  const fetchEvents = async (_key: string): Promise<Event[]> => {
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

  const [events, { refetch }] = createResource(filterKey, fetchEvents)

  return { events, refetch }
}

export function useEventStatusUpdate() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateStatus = async (eventId: string, status: EventStatus) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('events')
        .update({ status: status as any })
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

  return { updateStatus, loading, error }
}

export function useEventRegistrations(eventId: () => string | undefined) {
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

  const [registrations, { refetch }] = createResource(eventId, fetchRegistrations)

  return { registrations, refetch }
}

export function useRegistrationActions() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateRSVPStatus = async (rsvpId: string, status: RSVPStatus) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('event_rsvps')
        .update({ status: status as any })
        .eq('id', rsvpId)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const bulkCheckIn = async (rsvpIds: string[]) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('event_rsvps')
        .update({ status: 'checked_in' as any })
        .in('id', rsvpIds)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { updateRSVPStatus, bulkCheckIn, loading, error }
}
