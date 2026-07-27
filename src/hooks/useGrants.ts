import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import { escapeIlike } from '../lib/utils'
import type { Grant } from '../types'

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

  const [grants, { refetch }] = createResource(fetchGrants)

  return { grants, refetch }
}

export function useGrant(id: () => string | undefined) {
  const fetchGrant = async (grantId: string): Promise<Grant | null> => {
    const { data, error } = await supabase
      .from('grants')
      .select('*')
      .eq('id', grantId)
      .single()

    if (error) throw error
    return data as any
  }

  const [grant, { refetch }] = createResource(id, fetchGrant)

  return { grant, refetch }
}

export function useCreateGrant() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createGrant = async (grantData: {
    title: string
    description?: string
    amount_min?: number
    amount_max?: number
    currency?: string
    deadline?: string
    eligibility?: string
    application_url?: string
    grant_type?: string
  }) => {
    setLoading(true)
    setError(null)

    try {
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
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { createGrant, loading, error }
}

export function useUpdateGrant() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateGrant = async (grantId: string, updates: Partial<Grant>) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('grants')
        .update(updates)
        .eq('id', grantId)
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

  return { updateGrant, loading, error }
}

// Grant Applications
export function useGrantApplications(userId?: () => string | undefined) {
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

  const [applications, { refetch }] = createResource(userId, fetchApplications)

  return { applications, refetch }
}

export function useApplyForGrant() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const applyForGrant = async (applicationData: {
    grant_id: string
    user_id: string
    application_data: Record<string, any>
  }) => {
    setLoading(true)
    setError(null)

    try {
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
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

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

  return { applyForGrant, checkApplication, getApplicationCount, loading, error }
}
