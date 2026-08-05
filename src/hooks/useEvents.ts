import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import { rankRows, type ContentSort } from '../lib/personalization'
import { usePersonalizationActive } from './usePersonalization'
import { useAchievementTrigger } from '../contexts/AchievementContext'
import { listEntityUploadPaths, removeEntityUploads } from '../lib/entity-uploads'
import { isUuid } from '../lib/slug'
import { announceRegistration } from '../lib/event-registration'
import type { CalendarAccent } from '../lib/constants'
import type { AttendanceType, DetailEntry, Event, RSVPStatus } from '../types'

export function useEvents(
  filters?: {
    type?: string
    upcoming?: boolean
    /** Events already finished, newest first. Ignored when `upcoming` is set. */
    past?: boolean
    search?: string
    status?: string
    climateAction?: boolean
    dateRange?: { start: string; end: string }
    tags?: string[]
    sort?: ContentSort
  },
  options?: { enabled?: boolean }
) {
  // Sorted so ['ai','climate'] and ['climate','ai'] share one cache entry.
  const tags = filters?.tags?.length
    ? [...filters.tags].map(sanitizeTag).filter(Boolean).sort()
    : undefined

  // "For You" only survives if the ranker can actually do something, and never
  // in the calendar's date-window mode — a month grid has to stay in date order.
  const { active, uid } = usePersonalizationActive()
  const sort: ContentSort =
    filters?.sort === 'for_you' && active && !filters?.dateRange ? 'for_you' : 'upcoming'
  const normalized = { ...filters, tags, sort, uid: sort === 'for_you' ? uid : undefined }

  const fetchEvents = async (): Promise<Event[]> => {
    // Past events read best newest-first; everything else runs forwards in time.
    let query = supabase
      .from('events')
      .select(`
        *,
        organizer:profiles(*)
      `)
      .order('start_date', { ascending: !(filters?.past && !filters?.upcoming && !filters?.dateRange) })

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
      // In-progress multi-day events still count as upcoming until end_date passes
      const now = new Date().toISOString()
      query = query.or(`end_date.gte.${now},and(end_date.is.null,start_date.gte.${now})`)
    } else if (filters?.past) {
      const now = new Date().toISOString()
      query = query.or(`end_date.lt.${now},and(end_date.is.null,start_date.lt.${now})`)
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

    // A wider net under "For You" so the ranking has more than one page to
    // choose from.
    query = query.limit(filters?.dateRange ? 100 : sort === 'for_you' ? 150 : 50)

    const { data, error } = await query

    if (error) throw error
    const rows = (data as any[]) || []

    return sort === 'for_you' ? rankRows('event', rows) : rows
  }

  const query = useQuery({
    queryKey: keys.list('events', normalized),
    queryFn: fetchEvents,
    enabled: options?.enabled ?? true,
    // The second round trip is only worth paying for once a minute.
    staleTime: sort === 'for_you' ? 60_000 : undefined,
  })

  return { events: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Accepts either a uuid or a slug — see src/lib/slug.ts. */
export function useEvent(id: string | undefined) {
  const fetchEvent = async (eventId: string): Promise<Event | null> => {
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        organizer:profiles(*)
      `)
      .eq(isUuid(eventId) ? 'id' : 'slug', eventId)
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
      /** Calendar colour (105). Null follows the event_type palette. */
      accent_color?: CalendarAccent | null
      location?: string
      is_virtual?: boolean
      start_date: string
      end_date?: string
      capacity?: number
      organizer_id: string
      is_climate_action?: boolean
      has_challenge?: boolean
      submission_deadline?: string | null
      details?: DetailEntry[]
      /** Admins can publish straight from the form; everyone else gets a draft */
      status?: string
      has_venue?: boolean
      registration_closes_at?: string | null
      team_size_min?: number | null
      team_size_max?: number | null
    }) => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          ...eventData,
          event_type: eventData.event_type as any,
          is_virtual: eventData.is_virtual ?? false,
          // Must fall back rather than overwrite. Sitting after the spread as a
          // bare `status: 'draft'`, this silently discarded the admin's
          // "Published" choice — every event ever created landed as a draft.
          status: (eventData.status ?? 'draft') as any,
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
      // Enumerate the uploads first — after the row is gone the RPC's ownership
      // check has nothing to check against. For an event this covers both the
      // organizer's documents and the files on every submitted solution, since
      // deleting the event cascades to those too.
      const uploadPaths = await listEntityUploadPaths('event', eventId)

      const { error } = await supabase.from('events').delete().eq('id', eventId)

      if (error) throw error

      // The triggers reaped the rows; this clears the objects they pointed at.
      await removeEntityUploads(uploadPaths)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('events') })
      queryClient.invalidateQueries({ queryKey: keys.all('entity-documents') })
    },
  })

  return { deleteEvent: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * Registering, cancelling, and reading back where you stand.
 *
 * Since 096 an insert lands as `pending` — the RLS policy pins it there, so
 * this is a request to the organizer rather than a seat. `announceRegistration`
 * is what tells them; nothing else does.
 */
export function useRSVP() {
  const queryClient = useQueryClient()
  const triggerCheck = useAchievementTrigger()

  const rsvpMutation = useMutation({
    mutationFn: async ({
      eventId,
      userId,
      attendanceType,
      event,
      registrantName,
    }: {
      eventId: string
      userId: string
      attendanceType: AttendanceType
      event: Pick<Event, 'title' | 'organizer_id'>
      registrantName: string
    }) => {
      const { data, error } = await supabase
        .from('event_rsvps')
        .insert({
          event_id: eventId,
          user_id: userId,
          attendance_type: attendanceType,
        })
        .select()
        .single()

      if (error) throw error

      announceRegistration({
        eventId,
        eventTitle: event.title,
        organizerId: event.organizer_id,
        registrantName,
        attendanceType,
      })

      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'rsvp', variables.eventId) })
      triggerCheck()
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

  const rsvp = (
    eventId: string,
    userId: string,
    attendanceType: AttendanceType,
    event: Pick<Event, 'title' | 'organizer_id'>,
    registrantName: string
  ) => rsvpMutation.mutateAsync({ eventId, userId, attendanceType, event, registrantName })

  const cancelRSVP = (eventId: string, userId: string) => cancelMutation.mutateAsync({ eventId, userId })

  /**
   * Where the caller stands on this event, or null if they have not asked.
   *
   * Returns the row rather than a boolean because "has a row" no longer means
   * "is attending" — a pending registration and a confirmed one need different
   * words on the button.
   */
  const checkRSVP = async (
    eventId: string,
    userId: string
  ): Promise<{ status: RSVPStatus; attendance_type: AttendanceType } | null> => {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('status, attendance_type')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return (data as any) || null
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

/**
 * Whether this user may configure the event: its organizer, or a platform
 * admin. Both setup pages gate on exactly this, and the RPCs and RLS policies
 * check the same thing server-side — so this is a courtesy that keeps people
 * out of a screen they cannot save from, not the control itself.
 */
export function useIsEventHost(event: Pick<Event, 'organizer_id'> | null | undefined): boolean {
  const auth = useAuth()

  return useMemo(() => {
    if (!event || !auth.user) return false
    if (event.organizer_id === auth.user.id) return true
    const roles = auth.profile?.roles || []
    return roles.includes('oecs') || roles.includes('super_admin')
  }, [event, auth.user, auth.profile])
}
