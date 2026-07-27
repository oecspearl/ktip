import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { EventArticle } from '../types'

export function useEventArticles(eventId: string | undefined) {
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

  const query = useQuery({
    queryKey: keys.sub('events', 'articles', eventId),
    queryFn: () => fetchArticles(eventId as string),
    enabled: !!eventId,
  })

  return { articles: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function usePublishedEventArticles(eventId: string | undefined) {
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

  const query = useQuery({
    queryKey: keys.sub('events', 'published-articles', eventId),
    queryFn: () => fetchArticles(eventId as string),
    enabled: !!eventId,
  })

  return { articles: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateEventArticle() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      event_id: string
      author_id: string
      title: string
      content: string
      article_type: string
      is_published: boolean
    }) => {
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
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'articles', variables.event_id) })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'published-articles', variables.event_id) })
    },
  })

  return { createArticle: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateEventArticle() {
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
        article_type?: string
        is_published?: boolean
      }
    }) => {
      const { data, error } = await supabase
        .from('event_articles')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'articles') })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'published-articles') })
    },
  })

  const updateEventArticle = (
    id: string,
    updates: {
      title?: string
      content?: string
      article_type?: string
      is_published?: boolean
    }
  ) => mutation.mutateAsync({ id, updates })

  return { updateEventArticle, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteEventArticle() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_articles')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'articles') })
      queryClient.invalidateQueries({ queryKey: keys.sub('events', 'published-articles') })
    },
  })

  return { deleteEventArticle: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
