import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { sendNotification } from '../lib/notify'
import { keys } from '../queries/keys'
import { ROLE_BY_SLUG } from '../lib/permissions'
import { resolveCopy } from '../i18n/copy'
import type { RoleSlug, VerificationRequest } from '../types'

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
    mutationFn: async (params: {
      userId: string
      files: File[]
      note?: string
      requestedRole?: RoleSlug
    }) => {
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
          requested_role: params.requestedRole ?? null,
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

/**
 * Ask for an organisation-tier role (migration 125).
 *
 * No documents: the reviewer is checking that this account speaks for the
 * organisation it names, and at onboarding there is nothing to upload yet. A
 * chamber or ministry proves itself by correspondence, not by a file picker.
 *
 * 23505 is the one-open-request-per-user index (035). Someone who asks twice
 * has already asked, so it is a success from where they are standing.
 */
export function useRequestOrgRole() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { userId: string; role: RoleSlug; note?: string }) => {
      const { error } = await (supabase as any).from('verification_requests').insert({
        user_id: params.userId,
        document_paths: [],
        user_note: params.note || null,
        requested_role: params.role,
      })

      if (error && error.code !== '23505') throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('verification') })
    },
  })

  return { requestOrgRole: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
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

/**
 * Admin: approve or reject. One RPC rather than the two table writes this used
 * to make (migration 125).
 *
 * The request row, the verified badge and — when the member asked for an
 * organisation role — the role itself are one decision, and an organisation
 * role cannot be written from a browser at all: it is not self-assignable, so
 * guard_profile_privileged_columns raises. review_verification_request() holds
 * the bypass and the Super Admin ceiling.
 */
export function useReviewVerification() {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      requestId: string
      userId: string
      approve: boolean
      reviewerId: string
      adminNote?: string
    }) => {
      const { data, error } = await (supabase as any).rpc('review_verification_request', {
        p_request: params.requestId,
        p_approve: params.approve,
        p_note: params.adminNote || null,
      })

      if (error) throw error

      if (data?.ok !== true) {
        throw new Error(
          data?.reason === 'forbidden'
            ? t`You do not have permission to review verification requests.`
            : data?.reason === 'already_reviewed'
              ? t`This request has already been reviewed.`
              : data?.reason === 'seat_requires_super_admin'
                ? t`Only a Super Admin can review an administrator's account.`
                : t`This request could not be reviewed.`
        )
      }

      const granted = data.granted_role as RoleSlug | null
      const grantedLabel = granted ? resolveCopy(i18n, ROLE_BY_SLUG[granted]?.label ?? granted) : null

      sendNotification({
        userId: params.userId,
        type: 'verification_result',
        title: params.approve ? t`Verification approved` : t`Verification not accepted`,
        body: params.approve
          ? grantedLabel
            ? t`Your organisation was approved. Your account now holds the ${grantedLabel} role.`
            : t`Your identity verification was approved. Your profile now shows a verified badge.`
          : params.adminNote || t`Your verification request was not accepted.`,
        link: params.approve && grantedLabel ? '/' : '/settings',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('verification') })
      queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
      queryClient.invalidateQueries({ queryKey: keys.all('profile') })
    },
  })

  return { reviewRequest: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}
