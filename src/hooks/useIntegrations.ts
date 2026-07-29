import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
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
