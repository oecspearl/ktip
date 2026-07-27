import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { Grievance, GrievanceStatus } from '../types'

// User: fetch own submitted grievances
export function useMyGrievances(userId: string | undefined) {
  const fetchGrievances = async (uid: string): Promise<Grievance[]> => {
    const { data, error } = await (supabase as any)
      .from('grievances')
      .select('*, reported_user:profiles!reported_user_id(*)')
      .eq('reporter_id', uid)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.sub('grievances', 'mine', userId),
    queryFn: () => fetchGrievances(userId as string),
    enabled: !!userId,
  })

  return { grievances: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// User: create a new grievance
export function useCreateGrievance() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (grievanceData: {
      reporter_id: string
      reported_user_id: string
      category: string
      description: string
      evidence_url?: string
      context?: string
    }) => {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('grievances') })
    },
  })

  return { createGrievance: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

// Admin: fetch ALL grievances with filters
export function useAdminGrievances(filters?: { status?: string; category?: string }) {
  const fetchGrievances = async (): Promise<Grievance[]> => {
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

  const query = useQuery({
    queryKey: keys.list('grievances', filters),
    queryFn: fetchGrievances,
  })

  return { grievances: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// Admin: update grievance status and notes
export function useUpdateGrievance() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({
      grievanceId,
      updates,
    }: {
      grievanceId: string
      updates: {
        status?: GrievanceStatus
        admin_notes?: string
        resolved_by?: string
        resolved_at?: string
      }
    }) => {
      const { data, error } = await (supabase as any)
        .from('grievances')
        .update(updates)
        .eq('id', grievanceId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('grievances') })
    },
  })

  const updateGrievance = (
    grievanceId: string,
    updates: {
      status?: GrievanceStatus
      admin_notes?: string
      resolved_by?: string
      resolved_at?: string
    }
  ) => mutation.mutateAsync({ grievanceId, updates })

  return { updateGrievance, loading: mutation.isPending, error: mutation.error }
}
