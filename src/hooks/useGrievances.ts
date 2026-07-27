import { createSignal, createResource } from 'solid-js'
import { supabase } from '../lib/supabase'
import type { Grievance, GrievanceStatus } from '../types'

// User: fetch own submitted grievances
export function useMyGrievances(userId: () => string | undefined) {
  const fetchGrievances = async (uid: string): Promise<Grievance[]> => {
    const { data, error } = await (supabase as any)
      .from('grievances')
      .select('*, reported_user:profiles!reported_user_id(*)')
      .eq('reporter_id', uid)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const [grievances, { refetch }] = createResource(userId, fetchGrievances)

  return { grievances, refetch }
}

// User: create a new grievance
export function useCreateGrievance() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const createGrievance = async (grievanceData: {
    reporter_id: string
    reported_user_id: string
    category: string
    description: string
    evidence_url?: string
    context?: string
  }) => {
    setLoading(true)
    setError(null)

    try {
      const insertData: Record<string, any> = {
        reporter_id: grievanceData.reporter_id,
        reported_user_id: grievanceData.reported_user_id,
        category: grievanceData.category,
        description: grievanceData.description,
        status: 'pending',
      }

      if (grievanceData.evidence_url) {
        insertData.evidence_url = grievanceData.evidence_url
      }
      if (grievanceData.context) {
        insertData.context = grievanceData.context
      }

      const { data, error } = await (supabase as any)
        .from('grievances')
        .insert(insertData)
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

  return { createGrievance, loading, error }
}

// Admin: fetch ALL grievances with filters
export function useAdminGrievances(filters?: {
  status?: string
  category?: string
}) {
  const filterKey = () => JSON.stringify({
    status: filters?.status,
    category: filters?.category,
  })

  const fetchGrievances = async (_key: string): Promise<Grievance[]> => {
    let query = (supabase as any)
      .from('grievances')
      .select(`
        *,
        reporter:profiles!reporter_id(*),
        reported_user:profiles!reported_user_id(*)
      `)
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }

    const { data, error } = await query

    if (error) throw error
    return (data as any[]) || []
  }

  const [grievances, { refetch }] = createResource(filterKey, fetchGrievances)

  return { grievances, refetch }
}

// Admin: update grievance status and notes
export function useUpdateGrievance() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const updateGrievance = async (
    grievanceId: string,
    updates: {
      status?: GrievanceStatus
      admin_notes?: string
      resolved_by?: string
      resolved_at?: string
    }
  ) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await (supabase as any)
        .from('grievances')
        .update(updates)
        .eq('id', grievanceId)
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

  return { updateGrievance, loading, error }
}
