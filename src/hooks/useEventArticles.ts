import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { EventArticle } from '../types'

export function useEventArticles(eventId: () => string | undefined) {
  const fetchArticles = async (id: string): Promise<EventArticle[]> => {
    const { data, error } = await supabase
      .from('event_articles')
      .select(`
        *,
        author:profiles(*)
      `)
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const [articles, { refetch }] = createResource(eventId, fetchArticles)

  return { articles, refetch }
}

export function usePublishedEventArticles(eventId: () => string | undefined) {
  const fetchArticles = async (id: string): Promise<EventArticle[]> => {
    const { data, error } = await supabase
      .from('event_articles')
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

  const [articles, { refetch }] = createResource(eventId, fetchArticles)

  return { articles, refetch }
}

export function useCreateEventArticle() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createArticle = async (data: {
    event_id: string
    author_id: string
    title: string
    content: string
    article_type: string
    is_published: boolean
  }) => {
    setLoading(true)
    setError(null)

    try {
      const { data: result, error } = await supabase
        .from('event_articles')
        .insert({
          ...data,
          article_type: data.article_type as any,
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

  return { createArticle, loading, error }
}

export function useUpdateEventArticle() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateEventArticle = async (id: string, updates: {
    title?: string
    content?: string
    article_type?: string
    is_published?: boolean
  }) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('event_articles')
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

  return { updateEventArticle, loading, error }
}

export function useDeleteEventArticle() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const deleteEventArticle = async (id: string) => {
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('event_articles')
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

  return { deleteEventArticle, loading, error }
}
