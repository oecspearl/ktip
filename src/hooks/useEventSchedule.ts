import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { EventScheduleItem } from '../types'

export function useEventSchedule(eventId: () => string | undefined) {
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

  const [schedule, { refetch }] = createResource(eventId, fetchSchedule)

  return { schedule, refetch }
}

export function useCreateScheduleItem() {
  const [loading, setLoading] = createSignal(false)

  const createItem = async (data: {
    event_id: string
    title: string
    description?: string
    start_time: string
    end_time?: string
    location?: string
    speaker_id?: string
    schedule_type: string
  }) => {
    setLoading(true)
    try {
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
    } finally {
      setLoading(false)
    }
  }

  return { createItem, loading }
}

export function useUpdateScheduleItem() {
  const [loading, setLoading] = createSignal(false)

  const updateItem = async (itemId: string, updates: Record<string, any>) => {
    setLoading(true)
    try {
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
    } finally {
      setLoading(false)
    }
  }

  return { updateItem, loading }
}

export function useDeleteScheduleItem() {
  const [loading, setLoading] = createSignal(false)

  const deleteItem = async (itemId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('event_schedule')
        .delete()
        .eq('id', itemId)

      if (error) throw error
    } finally {
      setLoading(false)
    }
  }

  return { deleteItem, loading }
}
