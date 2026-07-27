import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EventUpdate } from '../types'

export function useEventUpdates(eventId: string | undefined) {
  const fetchUpdates = async (id: string): Promise<EventUpdate[]> => {
    const { data, error } = await supabase
      .from('event_updates')
      .select(`
        *,
        author:profiles(*)
      `)
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'updates', eventId),
    queryFn: () => fetchUpdates(eventId as string),
    enabled: !!eventId,
  })

  return { updates: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function usePublishedEventUpdates(eventId: string | undefined) {
  const fetchUpdates = async (id: string): Promise<EventUpdate[]> => {
    const { data, error } = await supabase
      .from('event_updates')
      .select(`
        *,
        author:profiles(*)
      `)
      .eq('event_id', id)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'published-updates', eventId),
    queryFn: () => fetchUpdates(eventId as string),
    enabled: !!eventId,
  })

  return { updates: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateEventUpdate() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      event_id: string
      author_id: string
      title: string
      content: string
      update_type: string
      is_published: boolean
    }) => {
      const { data: result, error } = await supabase
        .from('event_updates')
        .insert({
          ...data,
          update_type: data.update_type as any,
        } as any)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'updates', variables.event_id) })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'published-updates', variables.event_id) })
    },
  })

  return { createUpdate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateEventUpdate() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: {
        title?: string
        content?: string
        update_type?: string
        is_published?: boolean
      }
    }) => {
      const { data, error } = await supabase
        .from('event_updates')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'updates') })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'published-updates') })
    },
  })

  const updateEventUpdate = (
    id: string,
    updates: {
      title?: string
      content?: string
      update_type?: string
      is_published?: boolean
    }
  ) => mutation.mutateAsync({ id, updates })

  return { updateEventUpdate, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteEventUpdate() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_updates')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'updates') })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'published-updates') })
    },
  })

  return { deleteEventUpdate: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
