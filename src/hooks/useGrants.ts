import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import { keys } from '../queries/keys'
import type { DetailEntry, Grant } from '../types'

export function useGrants(filters?: {
  type?: string
  active?: boolean
  search?: string
  climateAction?: boolean
}) {
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

    // Search filter
    if (filters?.search) {
      const sanitized = escapeIlike(filters.search)
      if (sanitized) {
        query = query.or(
          `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,eligibility.ilike.%${sanitized}%`
        )
      }
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('grants', filters),
    queryFn: fetchGrants,
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

export function useApplyForGrant() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (applicationData: {
      grant_id: string
      user_id: string
      application_data: Record<string, any>
    }) => {
      // Encrypt sensitive application data (in production, use pgcrypto on server)
      const { data, error } = await supabase
        .from('grant_applications')
        .insert({
          ...applicationData,
          status: 'pending',
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: keys.sub('grants', 'applications', variables.user_id) })
    },
  })

  const applyForGrant = mutation.mutateAsync

  const checkApplication = async (
    grantId: string,
    userId: string
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from('grant_applications')
      .select('id')
      .eq('grant_id', grantId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return !!data
  }

  const getApplicationCount = async (grantId: string): Promise<number> => {
    const { count, error } = await supabase
      .from('grant_applications')
      .select('*', { count: 'exact', head: true })
      .eq('grant_id', grantId)

    if (error) throw error
    return count || 0
  }

  return { applyForGrant, checkApplication, getApplicationCount, loading: mutation.isPending, error: mutation.error }
}
