import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { EventUpdate } from '../types'

export function useEventUpdates(eventId: () => string | undefined) {
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

  const [updates, { refetch }] = createResource(eventId, fetchUpdates)

  return { updates, refetch }
}

export function usePublishedEventUpdates(eventId: () => string | undefined) {
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

  const [updates, { refetch }] = createResource(eventId, fetchUpdates)

  return { updates, refetch }
}

export function useCreateEventUpdate() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createUpdate = async (data: {
    event_id: string
    author_id: string
    title: string
    content: string
    update_type: string
    is_published: boolean
  }) => {
    setLoading(true)
    setError(null)

    try {
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
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createUpdate, loading, error }
}

export function useUpdateEventUpdate() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateEventUpdate = async (id: string, updates: {
    title?: string
    content?: string
    update_type?: string
    is_published?: boolean
  }) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('event_updates')
        .update(updates as any)
        .eq('id', id)
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

  return { updateEventUpdate, loading, error }
}

export function useDeleteEventUpdate() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteEventUpdate = async (id: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('event_updates')
        .delete()
        .eq('id', id)

      if (error) throw error
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { deleteEventUpdate, loading, error }
}
