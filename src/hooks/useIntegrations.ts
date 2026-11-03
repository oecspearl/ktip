import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import { isUuid } from '../lib/slug'
import type { Integration } from '../types'

// Public: published integrations with search/category filter
export function useIntegrations(filters?: { category?: string; search?: string; tags?: string[] }) {
  // Sorted so ['ai','climate'] and ['climate','ai'] share one cache entry.
  const tags = filters?.tags?.length
    ? [...filters.tags].map(sanitizeTag).filter(Boolean).sort()
    : undefined
  const normalized = { ...filters, tags }

  const fetchIntegrations = async (): Promise<Integration[]> => {
    let query = (supabase as any)
      .from('integrations')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }
    // "any of" — AND semantics would empty the list on the second chip click
    if (tags?.length) {
      query = query.overlaps('tags', tags)
    }
    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `name.ilike.%${sanitized}%,summary.ilike.%${sanitized}%,description.ilike.%${sanitized}%,tags_text.ilike.%${sanitized}%`
        )
      }
    }

    const { data, error } = await query
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('integrations', normalized),
    queryFn: fetchIntegrations,
  })

  return { integrations: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/**
 * The detail page's address. By id: the integrations table has no slug column
 * (038), and the page is not meant to be shared outside the platform.
 */
export function integrationPath(integration: Pick<Integration, 'id'>): string {
  return `/integrations/${integration.id}`
}

// Public: one published integration, for its detail page
export function useIntegration(id: string | undefined) {
  const fetchIntegration = async (): Promise<Integration | null> => {
    // A mistyped address is "not found", not a PostgREST cast error.
    if (!id || !isUuid(id)) return null
    const { data, error } = await (supabase as any)
      .from('integrations')
      .select('*')
      .eq('id', id)
      .eq('is_published', true)
      .maybeSingle()
    if (error) throw error
    return (data as Integration | null) ?? null
  }

  const query = useQuery({
    queryKey: keys.detail('integrations', id),
    queryFn: fetchIntegration,
    enabled: !!id,
  })

  return { integration: query.data ?? null, loading: query.isPending && !!id, error: query.error }
}

// Admin: all integrations (published + drafts)
export function useAdminIntegrations() {
  const fetchAll = async (): Promise<Integration[]> => {
    const { data, error } = await (supabase as any)
      .from('integrations')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('admin-integrations'),
    queryFn: fetchAll,
  })

  return { integrations: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useIntegrationMutations() {
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('integrations') })
    queryClient.invalidateQueries({ queryKey: keys.all('admin-integrations') })
  }

  const createMutation = useMutation({
    mutationFn: async (integrationData: {
      name: string
      description: string
      summary?: string | null
      tags?: string[]
      category: string
      website_url: string
      logo_url?: string
      is_published?: boolean
      sort_order?: number
    }) => {
      const { data, error } = await (supabase as any)
        .from('integrations')
        .insert(integrationData)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Integration> }) => {
      const { data, error } = await (supabase as any)
        .from('integrations')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('integrations')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return {
    createIntegration: createMutation.mutateAsync,
    updateIntegration: (id: string, updates: Partial<Integration>) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteIntegration: deleteMutation.mutateAsync,
    loading: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    error: createMutation.error || updateMutation.error || deleteMutation.error,
  }
}
