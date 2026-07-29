import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import { rankRows, type ContentSort } from '../lib/personalization'
import { usePersonalizationActive } from './usePersonalization'
import type { DetailEntry, Grant } from '../types'

export function useGrants(filters?: {
  type?: string
  active?: boolean
  search?: string
  climateAction?: boolean
  tags?: string[]
  sort?: ContentSort
}) {
  // Sorted so ['ai','climate'] and ['climate','ai'] share one cache entry.
  const tags = filters?.tags?.length
    ? [...filters.tags].map(sanitizeTag).filter(Boolean).sort()
    : undefined

  // "For You" only survives if the ranker can actually do something. Grants
  // fall back to deadline order, not recency — that is what the query does.
  const { active, uid } = usePersonalizationActive()
  const sort: ContentSort = filters?.sort === 'for_you' && active ? 'for_you' : 'deadline'
  const normalized = { ...filters, tags, sort, uid: sort === 'for_you' ? uid : undefined }

  const fetchGrants = async (): Promise<Grant[]> => {
    let query = supabase
      .from('grants')
      .select('*')
      .order('deadline', { ascending: true, nullsFirst: false })

    // Filter by active status
    if (filters?.active !== undefined) {
      query = query.eq('is_active', filters.active)
    }

    // Filter by grant type
    if (filters?.type) {
      query = query.eq('grant_type', filters.type)
    }

    // Climate action filter
    if (filters?.climateAction) {
      query = query.eq('is_climate_action', true)
    }

    // "any of" — AND semantics would empty the list on the second chip click
    if (tags?.length) {
      query = (query as any).overlaps('tags', tags)
    }

    // Search filter
    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,eligibility.ilike.%${sanitized}%,tags_text.ilike.%${sanitized}%`
        )
      }
    }

    // Unbounded until now. The ranker in 061 caps the ids it will score, and
    // an unbounded list would blow past that on a large corpus.
    query = query.limit(200)

    const { data, error } = await query

    if (error) throw error
    const rows = (data as any[]) || []

    return sort === 'for_you' ? rankRows('grant', rows) : rows
  }

  const query = useQuery({
    queryKey: keys.list('grants', normalized),
    queryFn: fetchGrants,
    // The second round trip is only worth paying for once a minute.
    staleTime: sort === 'for_you' ? 60_000 : undefined,
  })

  return { grants: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useGrant(id: string | undefined) {
  const fetchGrant = async (grantId: string): Promise<Grant | null> => {
    const { data, error } = await supabase
      .from('grants')
      .select('*')
      .eq('id', grantId)
      .single()

    if (error) throw error
    return data as any
  }

  const query = useQuery({
    queryKey: keys.detail('grants', id),
    queryFn: () => fetchGrant(id as string),
    enabled: !!id,
  })

  return { grant: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useCreateGrant() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (grantData: {
      title: string
      summary?: string | null
      description?: string
      amount_min?: number
      amount_max?: number
      currency?: string
      deadline?: string
      eligibility?: string
      application_url?: string
      grant_type?: string
      is_climate_action?: boolean
      details?: DetailEntry[]
    }) => {
      const { data, error } = await supabase
        .from('grants')
        .insert({
          ...grantData,
          currency: grantData.currency || 'USD',
          is_active: true,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('grants') })
    },
  })

  return { createGrant: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export function useUpdateGrant() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      grantId,
      updates,
    }: {
      grantId: string
      updates: Partial<Grant>
    }) => {
      const { data, error } = await supabase
        .from('grants')
        .update(updates)
        .eq('id', grantId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('grants') })
    },
  })

  const updateGrant = (grantId: string, updates: Partial<Grant>) =>
    mutation.mutateAsync({ grantId, updates })

  return { updateGrant, loading: mutation.isPending, error: mutation.error }
}

// Grant Applications
export function useGrantApplications(userId?: string) {
  const fetchApplications = async (uid: string) => {
    const { data, error } = await supabase
      .from('grant_applications')
      .select(`
        *,
        grant:grants(*)
      `)
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('grants', 'applications', userId),
    queryFn: () => fetchApplications(userId as string),
    enabled: !!userId,
  })

  return { applications: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// Fetches the current user's application (any status) for a grant.
// status === 'draft' → resume; anything else → already applied.
export function useDraftApplication(grantId?: string, userId?: string) {
  const query = useQuery({
    queryKey: keys.sub('grants', 'application', `${grantId}:${userId}`),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grant_applications')
        .select('*')
        .eq('grant_id', grantId as string)
        .eq('user_id', userId as string)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!grantId && !!userId,
  })

  return { application: query.data, loading: query.isPending, refetch: query.refetch }
}

export function useApplyForGrant() {
  const queryClient = useQueryClient()

  const invalidate = (userId: string) => {
    queryClient.invalidateQueries({ queryKey: keys.sub('grants', 'applications', userId) })
    queryClient.invalidateQueries({ queryKey: keys.sub('grants', 'application') })
    queryClient.invalidateQueries({ queryKey: keys.all('dashboard') })
  }

  const saveMutation = useMutation({
    mutationFn: async (draft: {
      grant_id: string
      user_id: string
      application_data: Record<string, any>
      current_step: number
    }) => {
      const { data, error } = await supabase
        .from('grant_applications')
        .upsert(
          { ...draft, status: 'draft' },
          { onConflict: 'grant_id,user_id' }
        )
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => invalidate(variables.user_id),
  })

  const submitMutation = useMutation({
    mutationFn: async (submission: {
      id: string
      user_id: string
      application_data: Record<string, any>
      current_step: number
    }) => {
      const { data, error } = await supabase
        .from('grant_applications')
        .update({
          application_data: submission.application_data,
          current_step: submission.current_step,
          status: 'pending',
        })
        .eq('id', submission.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => invalidate(variables.user_id),
  })

  const saveDraft = saveMutation.mutateAsync
  const submitApplication = submitMutation.mutateAsync

  const getApplicationCount = async (grantId: string): Promise<number> => {
    const { count, error } = await supabase
      .from('grant_applications')
      .select('*', { count: 'exact', head: true })
      .eq('grant_id', grantId)
      .neq('status', 'draft')

    if (error) throw error
    return count || 0
  }

  return {
    saveDraft,
    submitApplication,
    getApplicationCount,
    loading: saveMutation.isPending || submitMutation.isPending,
    error: saveMutation.error || submitMutation.error,
  }
}
