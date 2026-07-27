import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { EventSpeaker } from '../types'

export function useEventSpeakers(eventId: () => string | undefined) {
  const fetchSpeakers = async (id: string): Promise<EventSpeaker[]> => {
    const { data, error } = await supabase
      .from('event_speakers')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const [speakers, { refetch }] = createResource(eventId, fetchSpeakers)

  return { speakers, refetch }
}

export function useCreateSpeaker() {
  const [loading, setLoading] = createSignal(false)

  const createSpeaker = async (data: {
    event_id: string
    name: string
    title?: string
    bio?: string
    photo_url?: string
    website?: string
  }) => {
    setLoading(true)
    try {
      const insertData: any = {
        event_id: data.event_id,
        name: data.name,
      }
      if (data.title) insertData.title = data.title
      if (data.bio) insertData.bio = data.bio
      if (data.photo_url) insertData.photo_url = data.photo_url
      if (data.website) insertData.website = data.website

      const { data: result, error } = await supabase
        .from('event_speakers')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error
      return result
    } finally {
      setLoading(false)
    }
  }

  return { createSpeaker, loading }
}

export function useUpdateSpeaker() {
  const [loading, setLoading] = createSignal(false)

  const updateSpeaker = async (speakerId: string, updates: Record<string, any>) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('event_speakers')
        .update(updates as any)
        .eq('id', speakerId)
        .select()
        .single()

      if (error) throw error
      return data
    } finally {
      setLoading(false)
    }
  }

  return { updateSpeaker, loading }
}

export function useDeleteSpeaker() {
  const [loading, setLoading] = createSignal(false)

  const deleteSpeaker = async (speakerId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('event_speakers')
        .delete()
        .eq('id', speakerId)

      if (error) throw error
    } finally {
      setLoading(false)
    }
  }

  return { deleteSpeaker, loading }
}
