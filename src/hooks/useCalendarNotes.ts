import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { CalendarNote, CalendarNoteDraft } from '../types'

interface CalendarNotesOptions {
  /** ISO start of the visible window */
  start: string
  /** ISO end of the visible window */
  end: string
  userId?: string
  enabled?: boolean
}

/**
 * The viewer's own notes, tasks and reminders for the visible window.
 *
 * No scope parameter, unlike the rest of the calendar feed: these are private
 * by construction (migration 105), so there is no platform-wide version of them
 * for an admin to look at.
 */
export function useCalendarNotes({ start, end, userId, enabled = true }: CalendarNotesOptions) {
  const queryClient = useQueryClient()
  const active = enabled && Boolean(userId)

  // Day granularity keeps the key stable across re-renders within a window
  const listKey = keys.list('calendar-notes', {
    start: format(new Date(start), 'yyyy-MM-dd'),
    end: format(new Date(end), 'yyyy-MM-dd'),
    userId,
  })

  const query = useQuery({
    queryKey: listKey,
    enabled: active,
    queryFn: async (): Promise<CalendarNote[]> => {
      const { data, error } = await supabase
        .from('calendar_notes')
        .select('*')
        // A note that starts before the window can still run into it
        .lte('starts_at', end)
        .order('starts_at', { ascending: true })
      if (error) throw error
      const rows = ((data as any[]) || []) as CalendarNote[]
      return rows.filter((note) => (note.ends_at ?? note.starts_at) >= start)
    },
  })

  /** Anything that changes a note invalidates every window, not just this one. */
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: keys.list('calendar-notes') })

  const create = useMutation({
    mutationFn: async (draft: CalendarNoteDraft): Promise<CalendarNote> => {
      if (!userId) throw new Error('Sign in to add a note')
      const { data, error } = await (supabase.from('calendar_notes') as any)
        .insert({ ...draft, user_id: userId })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as CalendarNote
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CalendarNote> }) => {
      const { error } = await (supabase.from('calendar_notes') as any).update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calendar_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    notes: active ? (query.data ?? []) : [],
    loading: active && query.isPending,
    error: query.error,
    createNote: create.mutateAsync,
    creating: create.isPending,
    updateNote: update.mutateAsync,
    deleteNote: remove.mutateAsync,
  }
}
