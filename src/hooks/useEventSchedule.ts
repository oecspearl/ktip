import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EventScheduleItem } from '../types'

export function useEventSchedule(eventId: string | undefined) {
  const fetchSchedule = async (id: string): Promise<EventScheduleItem[]> => {
    const { data, error } = await supabase
      .from('event_schedule')
      .select(`
        *,
        speaker:event_speakers(*)
      `)
      .eq('event_id', id)
      .order('start_time', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'schedule', eventId),
    queryFn: () => fetchSchedule(eventId as string),
    enabled: !!eventId,
  })

  return { schedule: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateScheduleItem() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      event_id: string
      title: string
      description?: string
      start_time: string
      end_time?: string
      location?: string
      speaker_id?: string
      schedule_type: string
    }) => {
      const insertData: any = {
        event_id: data.event_id,
        title: data.title,
        start_time: data.start_time,
        schedule_type: data.schedule_type as any,
      }
      if (data.description) insertData.description = data.description
      if (data.end_time) insertData.end_time = data.end_time
      if (data.location) insertData.location = data.location
      if (data.speaker_id) insertData.speaker_id = data.speaker_id

      const { data: result, error } = await supabase
        .from('event_schedule')
        .insert(insertData)
        .select(`
          *,
          speaker:event_speakers(*)
        `)
        .single()

      if (error) throw error
      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'schedule', variables.event_id) })
    },
  })

  return { createItem: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateScheduleItem() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      itemId,
      updates,
    }: {
      itemId: string
      updates: Record<string, any>
    }) => {
      const { data, error } = await supabase
        .from('event_schedule')
        .update(updates as any)
        .eq('id', itemId)
        .select(`
          *,
          speaker:event_speakers(*)
        `)
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'schedule') })
    },
  })

  const updateItem = (itemId: string, updates: Record<string, any>) =>
    mutation.mutateAsync({ itemId, updates })

  return { updateItem, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteScheduleItem() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('event_schedule')
        .delete()
        .eq('id', itemId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'schedule') })
    },
  })

  return { deleteItem: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
