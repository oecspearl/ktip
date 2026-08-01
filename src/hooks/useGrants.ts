import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike, sanitizeTag } from '../lib/utils'
import { keys } from '../queries/keys'
import { rankRows, type ContentSort } from '../lib/personalization'
import { usePersonalizationActive } from './usePersonalization'
import { useAchievementTrigger } from '../contexts/AchievementContext'
import { listEntityUploadPaths, removeEntityUploads } from '../lib/entity-uploads'
import { isUuid } from '../lib/slug'
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

/** Accepts either a uuid or a slug — see src/lib/slug.ts. */
export function useGrant(id: string | undefined) {
  const fetchGrant = async (grantId: string): Promise<Grant | null> => {
    const { data, error } = await supabase
      .from('grants')
      .select('*')
      .eq(isUuid(grantId) ? 'id' : 'slug', grantId)
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
      // Migration 077's INSERT policy requires created_by = auth.uid(): a grant
      // filed under someone else's name is one its author cannot then manage.
      const { data: session } = await supabase.auth.getUser()
      const createdBy = session?.user?.id
      if (!createdBy) throw new Error('You must be signed in to post a grant')

      const { data, error } = await supabase
        .from('grants')
        .insert({
          ...grantData,
          created_by: createdBy,
          currency: grantData.currency || 'USD',
          is_active: true,
        } as any)
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

export function useDeleteGrant() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (grantId: string) => {
      // Uploads first, while the parent still exists for the RPC to check.
      const uploadPaths = await listEntityUploadPaths('grant', grantId)

      const { error } = await supabase.from('grants').delete().eq('id', grantId)
      if (error) throw error

      await removeEntityUploads(uploadPaths)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('grants') })
      queryClient.invalidateQueries({ queryKey: keys.all('entity-documents') })
    },
  })

  return { deleteGrant: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
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

/** Applications naming the signed-in user as sponsor. RLS scopes this. */
export function useSponsorshipRequests(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('grants', 'sponsorships', userId),
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await (supabase as any)
        .from('grant_applications')
        .select('*, grant:grants!grant_id(*), applicant:profiles!user_id(*)')
        .eq('sponsor_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data as any[]) || []
    },
    enabled: !!userId,
  })

  return {
    requests: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** The sponsor's half of the handshake. Only the named sponsor may call it. */
export function useReviewSponsorship() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { applicationId: string; accept: boolean; note?: string }) => {
      const { data, error } = await (supabase as any).rpc('review_grant_sponsorship', {
        p_application: params.applicationId,
        p_accept: params.accept,
        p_note: params.note ?? null,
      })

      if (error) throw error
      if (data && data.ok === false) {
        throw new Error(
          data.reason === 'forbidden'
            ? 'You are not permitted to sponsor this application.'
            : 'Application not found.'
        )
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('grants') })
    },
  })

  return {
    reviewSponsorship: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error,
  }
}

export function useApplyForGrant() {
  const queryClient = useQueryClient()
  const triggerCheck = useAchievementTrigger()

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
    // Only on submit, not on saveDraft: a draft is not an application, and
    // autosaving one every few seconds should not keep re-checking.
    onSuccess: (_data, variables) => {
      invalidate(variables.user_id)
      triggerCheck()
    },
  })

  /**
   * Nominate a faculty sponsor. Students cannot submit unaided — the 064
   * trigger rejects a non-draft status without an accepted sponsor — so this
   * is the first half of that handshake; review_grant_sponsorship() is the
   * second, and only the sponsor can call it.
   */
  const nominateMutation = useMutation({
    mutationFn: async (params: { id: string; user_id: string; sponsor_id: string | null }) => {
      const { error } = await (supabase as any)
        .from('grant_applications')
        .update({ sponsor_id: params.sponsor_id, sponsor_approved_at: null })
        .eq('id', params.id)

      if (error) throw error
    },
    onSuccess: (_data, variables) => invalidate(variables.user_id),
  })

  const saveDraft = saveMutation.mutateAsync
  const submitApplication = submitMutation.mutateAsync
  const nominateSponsor = nominateMutation.mutateAsync

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
    nominateSponsor,
    getApplicationCount,
    loading: saveMutation.isPending || submitMutation.isPending || nominateMutation.isPending,
    error: saveMutation.error || submitMutation.error || nominateMutation.error,
  }
}
