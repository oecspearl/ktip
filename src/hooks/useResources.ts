import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import { rankRows, type ContentSort } from '../lib/personalization'
import { usePersonalizationActive } from './usePersonalization'
import type { Resource } from '../types'

export function useResources(filters?: {
  type?: string
  category?: string
  search?: string
  climateAction?: boolean
  tags?: string[]
  sort?: ContentSort
}) {
  // Sorted so ['ai','climate'] and ['climate','ai'] share one cache entry.
  const tags = filters?.tags?.length
    ? [...filters.tags].map(sanitizeTag).filter(Boolean).sort()
    : undefined

  // "For You" only survives if the ranker can actually do something. The uid
  // enters the cache key only in that case, so signed-out and non-personalized
  // readers keep sharing the one cache entry they always did.
  const { active, uid } = usePersonalizationActive()
  const sort: ContentSort = filters?.sort === 'for_you' && active ? 'for_you' : 'newest'
  const normalized = { ...filters, tags, sort, uid: sort === 'for_you' ? uid : undefined }

  const fetchResources = async (): Promise<Resource[]> => {
    let query = (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (filters?.type) {
      query = query.eq('resource_type', filters.type)
    }

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }

    if (filters?.climateAction) {
      query = query.eq('is_climate_action', true)
    }

    // "any of" — AND semantics would empty the list on the second chip click
    if (tags?.length) {
      query = query.overlaps('tags', tags)
    }

    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,summary.ilike.%${sanitized}%,description.ilike.%${sanitized}%,tags_text.ilike.%${sanitized}%`
        )
      }
    }

    // Unbounded until now. The ranker caps the ids it will score, and an
    // unbounded list would blow past that on a large corpus.
    query = query.limit(200)

    const { data, error } = await query

    if (error) throw error
    const rows = (data as any[]) || []

    return sort === 'for_you' ? rankRows('resource', rows) : rows
  }

  const query = useQuery({
    queryKey: keys.list('resources', normalized),
    queryFn: fetchResources,
    // The second round trip is only worth paying for once a minute.
    staleTime: sort === 'for_you' ? 60_000 : undefined,
  })

  return { resources: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useResource(id: string | undefined) {
  const fetchResource = async (resourceId: string): Promise<Resource | null> => {
    const { data, error } = await (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .eq('id', resourceId)
      .single()

    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('resources', id),
    queryFn: () => fetchResource(id as string),
    enabled: !!id,
  })

  return { resource: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useAdminResources() {
  const fetchResources = async (): Promise<Resource[]> => {
    const { data, error } = await (supabase as any)
      .from('resources')
      .select('*, author:profiles(*)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('resources', 'admin'),
    queryFn: fetchResources,
  })

  return { resources: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateResource() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (resourceData: {
      title: string
      description?: string
      summary?: string | null
      content?: string
      resource_type: string
      category?: string
      tags?: string[]
      download_url?: string
      thumbnail_url?: string
      is_climate_action?: boolean
      is_published?: boolean
    }) => {
      const { data, error } = await (supabase as any)
        .from('resources')
        .insert(resourceData)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  return { createResource: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateResource() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      resourceId,
      updates,
    }: {
      resourceId: string
      updates: Record<string, any>
    }) => {
      const { data, error } = await (supabase as any)
        .from('resources')
        .update(updates)
        .eq('id', resourceId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  const updateResource = (resourceId: string, updates: Record<string, any>) =>
    mutation.mutateAsync({ resourceId, updates })

  return { updateResource, loading: mutation.isPending, error: mutation.error }
}

export function useDeleteResource() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (resourceId: string) => {
      const { error } = await (supabase as any)
        .from('resources')
        .delete()
        .eq('id', resourceId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('resources') })
    },
  })

  return { deleteResource: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
