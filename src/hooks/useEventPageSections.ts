import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EventPageSection } from '../types'

export function useEventPageSections(eventId: string | undefined) {
  const fetchSections = async (id: string): Promise<EventPageSection[]> => {
    const { data, error } = await supabase
      .from('event_page_sections')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'sections', eventId),
    queryFn: () => fetchSections(eventId as string),
    enabled: !!eventId,
  })

  return { sections: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function usePublicEventSections(eventId: string | undefined) {
  const fetchSections = async (id: string): Promise<EventPageSection[]> => {
    const { data, error } = await supabase
      .from('event_page_sections')
      .select('*')
      .eq('event_id', id)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('events', 'public-sections', eventId),
    queryFn: () => fetchSections(eventId as string),
    enabled: !!eventId,
  })

  return { sections: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateSection() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      event_id: string
      section_type: string
      title: string
      content?: Record<string, any>
      sort_order?: number
    }) => {
      const { data: result, error } = await supabase
        .from('event_page_sections')
        .insert({
          event_id: data.event_id,
          section_type: data.section_type as any,
          title: data.title,
          content: data.content || {},
          sort_order: data.sort_order ?? 0,
        } as any)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'sections', variables.event_id) })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'public-sections', variables.event_id) })
    },
  })

  return { createSection: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateSection() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      sectionId,
      updates,
    }: {
      sectionId: string
      updates: Partial<Pick<EventPageSection, 'title' | 'content' | 'sort_order' | 'is_visible'>>
    }) => {
      const { data, error } = await supabase
        .from('event_page_sections')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', sectionId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'sections') })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'public-sections') })
    },
  })

  const updateSection = (
    sectionId: string,
    updates: Partial<Pick<EventPageSection, 'title' | 'content' | 'sort_order' | 'is_visible'>>
  ) => mutation.mutateAsync({ sectionId, updates })

  return { updateSection, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteSection() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const { error } = await supabase
        .from('event_page_sections')
        .delete()
        .eq('id', sectionId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'sections') })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'public-sections') })
    },
  })

  return { deleteSection: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useReorderSections() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (sectionIds: string[]) => {
      const updates = sectionIds.map((id, index) =>
        supabase
          .from('event_page_sections')
          .update({ sort_order: index } as any)
          .eq('id', id)
      )
      await Promise.all(updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'sections') })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'public-sections') })
    },
  })

  return { reorderSections: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
