import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
import type { VerificationRequest } from '../types'

const BUCKET = 'verification-documents'

/** Latest verification request for the current user (any status). */
export function useMyVerificationRequest(userId: string | undefined) {
  const fetchRequest = async (uid: string): Promise<VerificationRequest | null> => {
    const { data, error } = await (supabase as any)
      .from('verification_requests')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return (data as VerificationRequest) || null
  }

  const query = useQuery({
    queryKey: keys.sub('verification', 'mine', userId),
    queryFn: () => fetchRequest(userId as string),
    enabled: !!userId,
  })

  return { request: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useSubmitVerification() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { userId: string; files: File[]; note?: string }) => {
      const paths: string[] = []
      for (const file of params.files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${params.userId}/${Date.now()}_${safeName}`
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false })
        if (uploadError) throw uploadError
        paths.push(path)
      }

      const { data, error } = await (supabase as any)
        .from('verification_requests')
        .insert({
          user_id: params.userId,
          document_paths: paths,
          user_note: params.note || null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('verification') })
    },
  })

  return { submitRequest: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

// Admin: all requests, filterable by status
export function useAdminVerificationRequests(filters?: { status?: string }) {
  const fetchRequests = async (): Promise<VerificationRequest[]> => {
    let query = (supabase as any)
      .from('verification_requests')
      .select('*, user:profiles!user_id(*)')
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as any[]) || []
  }

  const query = useQuery({
    queryKey: keys.list('verification', filters),
    queryFn: fetchRequests,
  })

  return { requests: query.data, loading: query.isPending, error: query.error, refetch: query.refetch }
}

/** Signed URL for a private verification document (1 hour). */
export async function getVerificationDocumentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

// Admin: approve/reject. Approval also flips profiles.is_verified,
// which fires the verified_member badge trigger.
export function useReviewVerification() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      requestId: string
      userId: string
      approve: boolean
      reviewerId: string
      adminNote?: string
    }) => {
      const { error } = await (supabase as any)
        .from('verification_requests')
        .update({
          status: params.approve ? 'approved' : 'rejected',
          reviewer_id: params.reviewerId,
          reviewed_at: new Date().toISOString(),
          admin_note: params.adminNote || null,
        })
        .eq('id', params.requestId)

      if (error) throw error

      if (params.approve) {
        const { error: profileError } = await (supabase as any)
          .from('profiles')
          .update({ is_verified: true })
          .eq('id', params.userId)
        if (profileError) throw profileError
      }

      sendNotification({
        userId: params.userId,
        type: 'verification_result',
        title: params.approve ? 'Verification approved' : 'Verification rejected',
        body: params.approve
          ? 'Your identity verification was approved. Your profile now shows a verified badge.'
          : params.adminNote || 'Your verification request was not approved.',
        link: '/settings',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('verification') })
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
    },
  })

  return { reviewRequest: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
