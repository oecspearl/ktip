import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { EventPageSection } from '../types'

export function useEventPageSections(eventId: () => string | undefined) {
  const fetchSections = async (id: string): Promise<EventPageSection[]> => {
    const { data, error } = await supabase
      .from('event_page_sections')
      .select('*')
      .eq('event_id', id)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const [sections, { refetch }] = createResource(eventId, fetchSections)

  return { sections, refetch }
}

export function usePublicEventSections(eventId: () => string | undefined) {
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

  const [sections] = createResource(eventId, fetchSections)

  return { sections }
}

export function useCreateSection() {
  const [loading, setLoading] = createSignal(false)

  const createSection = async (data: {
    event_id: string
    section_type: string
    title: string
    content?: Record<string, any>
    sort_order?: number
  }) => {
    setLoading(true)
    try {
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
    } finally {
      setLoading(false)
    }
  }

  return { createSection, loading }
}

export function useUpdateSection() {
  const [loading, setLoading] = createSignal(false)

  const updateSection = async (
    sectionId: string,
    updates: Partial<Pick<EventPageSection, 'title' | 'content' | 'sort_order' | 'is_visible'>>
  ) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('event_page_sections')
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', sectionId)
        .select()
        .single()

      if (error) throw error
      return data
    } finally {
      setLoading(false)
    }
  }

  return { updateSection, loading }
}

export function useDeleteSection() {
  const [loading, setLoading] = createSignal(false)

  const deleteSection = async (sectionId: string) => {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('event_page_sections')
        .delete()
        .eq('id', sectionId)

      if (error) throw error
    } finally {
      setLoading(false)
    }
  }

  return { deleteSection, loading }
}

export function useReorderSections() {
  const [loading, setLoading] = createSignal(false)

  const reorderSections = async (sectionIds: string[]) => {
    setLoading(true)
    try {
      const updates = sectionIds.map((id, index) =>
        supabase
          .from('event_page_sections')
          .update({ sort_order: index } as any)
          .eq('id', id)
      )
      await Promise.all(updates)
    } finally {
      setLoading(false)
    }
  }

  return { reorderSections, loading }
}
