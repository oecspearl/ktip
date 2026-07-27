import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'

export interface Preregistration {
  id: string
  email: string
  display_name: string
  country: string | null
  bio: string | null
  organization: string | null
  role: string
  skills: string[]
  linkedin_url: string | null
  status: 'pending' | 'approved' | 'rejected' | 'info_requested'
  admin_notes: string | null
  info_request_message: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Public: Submit a pre-registration (no auth required)
// ============================================================

export function useSubmitPreregistration() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (data: {
      email: string
      display_name: string
      country?: string
      bio?: string
      organization?: string
      role: string
      skills?: string[]
      linkedin_url?: string
    }) => {
      const { error: insertError } = await (supabase.from('preregistrations') as any).insert({
        email: data.email,
        display_name: data.display_name,
        country: data.country || null,
        bio: data.bio || null,
        organization: data.organization || null,
        role: data.role,
        skills: data.skills || [],
        linkedin_url: data.linkedin_url || null,
      })

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('An application with this email already exists.')
        }
        throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-preregistrations') })
    },
  })

  return { submit: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

// ============================================================
// Admin: Fetch all pre-registrations
// ============================================================

export function useAdminPreregistrations(filters?: {
  status?: string
  role?: string
}) {
  const fetchPreregistrations = async (): Promise<Preregistration[]> => {
    let query = (supabase.from('preregistrations') as any)
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.role) {
      query = query.eq('role', filters.role)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('admin-preregistrations', filters),
    queryFn: fetchPreregistrations,
  })

  return { preregistrations: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

// ============================================================
// Admin: Update pre-registration status/notes
// ============================================================

export function useAdminPreregistrationActions() {
  const queryClient = useQueryClient()

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Not authenticated')
    return `Bearer ${session.access_token}`
  }

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: {
        status?: string
        admin_notes?: string
        info_request_message?: string
      }
    }) => {
      const { data: { user } } = await supabase.auth.getUser()

      const { error: updateError } = await (supabase.from('preregistrations') as any)
        .update({
          ...updates,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (updateError) throw updateError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-preregistrations') })
    },
  })

  const approveMutation = useMutation({
    mutationFn: async ({
      preregistrationId,
      password,
    }: {
      preregistrationId: string
      password: string
    }) => {
      const auth = await getAuthHeader()
      const res = await fetch('/api/admin/approve-preregistration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ preregistration_id: preregistrationId, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to approve application')
      return json.user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('admin-preregistrations') })
    },
  })

  const updateStatus = (
    id: string,
    updates: {
      status?: string
      admin_notes?: string
      info_request_message?: string
    }
  ) => updateStatusMutation.mutateAsync({ id, updates })

  const approve = (preregistrationId: string, password: string) =>
    approveMutation.mutateAsync({ preregistrationId, password })

  return {
    updateStatus,
    approve,
    loading: updateStatusMutation.isPending || approveMutation.isPending,
    error: updateStatusMutation.error || approveMutation.error,
  }
}
