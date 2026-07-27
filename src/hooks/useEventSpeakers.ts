import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EventSpeaker } from '../types'

export function useEventSpeakers(eventId: string | undefined) {
  const fetchSpeakers = async (id: string): Promise<EventSpeaker[]> => {
    const { data, error } = await supabase
      .from('event_speakers')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'speakers', eventId),
    queryFn: () => fetchSpeakers(eventId as string),
    enabled: !!eventId,
  })

  return { speakers: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateSpeaker() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      event_id: string
      name: string
      title?: string
      bio?: string
      photo_url?: string
      website?: string
    }) => {
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
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'speakers', variables.event_id) })
    },
  })

  return { createSpeaker: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateSpeaker() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      speakerId,
      updates,
    }: {
      speakerId: string
      updates: Record<string, any>
    }) => {
      const { data, error } = await supabase
        .from('event_speakers')
        .update(updates as any)
        .eq('id', speakerId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'speakers') })
    },
  })

  const updateSpeaker = (speakerId: string, updates: Record<string, any>) =>
    mutation.mutateAsync({ speakerId, updates })

  return { updateSpeaker, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteSpeaker() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (speakerId: string) => {
      const { error } = await supabase
        .from('event_speakers')
        .delete()
        .eq('id', speakerId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'speakers') })
    },
  })

  return { deleteSpeaker: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
