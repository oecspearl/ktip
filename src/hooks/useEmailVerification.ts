import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  EmailProof,
  EmailVerificationResult,
  InstitutionRosterRow,
  TrustedEmailDomain,
} from '../types'

/**
 * Verification by email domain (migration 145).
 *
 * Three ways in, one decision on the server:
 *   - the PRIMARY address is already proven by Supabase, so it goes straight
 *     to claim_email_verification();
 *   - any OTHER address goes through /api/verification/send-proof, a mailed
 *     token, and /api/verification/confirm-proof;
 *   - the auth trigger handles new signups with nobody calling anything.
 */

function invalidateVerificationState(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['profile'] })
  queryClient.invalidateQueries({ queryKey: ['permissions'] })
  queryClient.invalidateQueries({ queryKey: keys.all('student-safeguarding') })
  queryClient.invalidateQueries({ queryKey: keys.all('institution-members') })
  queryClient.invalidateQueries({ queryKey: keys.all('verification') })
}

/** The primary address: decide what it is worth, no mail involved. */
export function useClaimEmailVerification() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (): Promise<EmailVerificationResult> => {
      const { data, error } = await (supabase as any).rpc('claim_email_verification')
      if (error) throw error
      return (data as EmailVerificationResult) ?? { ok: false }
    },
    onSuccess: (result) => {
      if (result.ok) invalidateVerificationState(queryClient)
    },
  })

  return { claim: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

export type SendProofResult =
  | { status: 'sent'; kind: 'trusted' | 'institution' | 'roster'; dev_link?: string }
  | { status: 'already_verified'; result: EmailVerificationResult }
  | { status: 'use_primary' }
  | { status: 'domain_not_recognised'; domain: string }

/** Any other address: mail a token. Refused before any mail if nothing would recognise it. */
export function useSendEmailProof() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (email: string): Promise<SendProofResult> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(t`No active session`)

      const res = await fetch('/api/verification/send-proof', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const failed = t`Could not send the confirmation email`
      const body = await res.json().catch(() => ({ error: failed }))

      if (res.ok) {
        if (body.already_verified) return { status: 'already_verified', result: body.result }
        return { status: 'sent', kind: body.kind, dev_link: body.dev_link }
      }
      if (body.error === 'use_primary') return { status: 'use_primary' }
      if (body.error === 'domain_not_recognised') {
        return { status: 'domain_not_recognised', domain: body.domain ?? email.split('@')[1] }
      }
      throw new Error(body.error || failed)
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: keys.all('email-proofs') })
      if (result.status === 'already_verified' && result.result.ok) {
        invalidateVerificationState(queryClient)
      }
    },
  })

  return { sendProof: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

/**
 * The caller's proven and pending addresses. Explicit column list, never '*':
 * RLS is column-blind, so the owner could read their own token, and it has no
 * business in browser memory.
 */
export function useMyEmailProofs(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.list('email-proofs', userId),
    queryFn: async (): Promise<EmailProof[]> => {
      const { data, error } = await (supabase.from('email_proofs') as any)
        .select('id, email, verified_at, token_expires_at, created_at')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as EmailProof[]) ?? []
    },
    enabled: !!userId,
  })

  return { proofs: query.data ?? [], loading: query.isPending, error: query.error }
}

/** Owner-only DELETE policy covers this — no endpoint needed. */
export function useRemoveEmailProof() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('email_proofs') as any).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('email-proofs') })
    },
  })

  return { removeProof: mutation.mutateAsync, loading: mutation.isPending }
}

// ---------------------------------------------------------------------------
// Admin: the trusted-domain list
// ---------------------------------------------------------------------------

export function useTrustedDomains(enabled = true) {
  const query = useQuery({
    queryKey: keys.list('trusted-domains'),
    queryFn: async (): Promise<TrustedEmailDomain[]> => {
      const { data, error } = await (supabase.from('trusted_email_domains') as any)
        .select('*')
        .order('domain', { ascending: true })
      if (error) throw error
      return (data as TrustedEmailDomain[]) ?? []
    },
    enabled,
  })

  return { domains: query.data ?? [], loading: query.isPending, error: query.error, refetch: query.refetch }
}

export function useSetTrustedDomain() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: {
      domain: string
      label: string
      grantsRole?: string | null
      isActive?: boolean
      notes?: string | null
    }) => {
      const { data, error } = await (supabase as any).rpc('set_trusted_email_domain', {
        p_domain: params.domain,
        p_label: params.label,
        p_grants_role: params.grantsRole ?? null,
        p_is_active: params.isActive ?? true,
        p_notes: params.notes ?? null,
      })
      if (error) throw error
      if (data?.ok !== true) {
        const messages: Record<string, string> = {
          forbidden: t`You do not have permission to manage trusted domains.`,
          role_requires_role_manage: t`Attaching a role to a domain needs the role management permission.`,
          invalid_domain: t`That is not a domain KTIP can trust. Free-mail providers are refused.`,
        }
        throw new Error(messages[data?.reason] || t`Could not save the domain.`)
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('trusted-domains') })
    },
  })

  return { setDomain: mutation.mutateAsync, loading: mutation.isPending, error: mutation.error }
}

// ---------------------------------------------------------------------------
// Admin: institution rosters and the auto-approve switch
// ---------------------------------------------------------------------------

export function useInstitutionRoster(institutionId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('institution-roster', 'list', institutionId),
    queryFn: async () => {
      const { data, error } = await (supabase.from('institution_rosters') as any)
        .select('id, institution_id, email, role, added_by, added_at, claimed_by, claimed_at')
        .eq('institution_id', institutionId as string)
        .order('added_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as InstitutionRosterRow[]
    },
    enabled: !!institutionId,
  })

  return { roster: query.data ?? [], loading: query.isPending, refetch: query.refetch }
}

export function useUpsertInstitutionRoster() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { institutionId: string; emails: string[]; role?: 'student' | 'educator' }) => {
      const { data, error } = await (supabase as any).rpc('upsert_institution_roster', {
        p_institution: params.institutionId,
        p_emails: params.emails,
        p_role: params.role ?? 'student',
      })
      if (error) throw error
      if (data?.ok !== true) {
        const messages: Record<string, string> = {
          forbidden: t`You do not have permission to manage this roster.`,
          institution_not_verified: t`Verify the institution before adding a roster.`,
          not_found: t`Institution not found.`,
        }
        throw new Error(messages[data?.reason] || t`Could not update the roster.`)
      }
      return data as { ok: true; added: number; skipped: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('institution-roster') })
    },
  })

  return { upsertRoster: mutation.mutateAsync, loading: mutation.isPending }
}

export function useRemoveRosterRow() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('institution_rosters') as any).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('institution-roster') })
    },
  })

  return { removeRow: mutation.mutateAsync, loading: mutation.isPending }
}

export function useSetAutoApproveStudents() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: { institutionId: string; enabled: boolean }) => {
      const { error } = await (supabase.from('institutions') as any)
        .update({ auto_approve_students: params.enabled, updated_at: new Date().toISOString() })
        .eq('id', params.institutionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('institutions') })
    },
  })

  return { setAutoApprove: mutation.mutateAsync, loading: mutation.isPending }
}
