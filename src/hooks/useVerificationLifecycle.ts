import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { VerifiedVia } from '../types'

/**
 * The verification lifecycle after the badge is earned (migrations 174–176):
 * its term and renewal, organisation codes, the history log, revoke and hold.
 *
 * Every read tolerates the RPC not existing yet. The client can ship before
 * Delon applies the migrations, and a missing function (PGRST202, or 404 from
 * PostgREST) reads as "feature not available" rather than an error, so the
 * panels that depend on it simply do not render.
 */

const MISSING = new Set(['PGRST202', '42883'])

function isMissing(error: { code?: string; status?: number } | null | undefined): boolean {
  return !!error && (MISSING.has(error.code ?? '') || error.status === 404)
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['profile'] })
  queryClient.invalidateQueries({ queryKey: ['permissions'] })
  queryClient.invalidateQueries({ queryKey: keys.all('verification') })
  queryClient.invalidateQueries({ queryKey: keys.all('verification-status') })
  queryClient.invalidateQueries({ queryKey: keys.all('verification-codes') })
  queryClient.invalidateQueries({ queryKey: keys.all('verification-events') })
  queryClient.invalidateQueries({ queryKey: keys.all('admin-users') })
}

// ---------------------------------------------------------------------------
// The member's own state
// ---------------------------------------------------------------------------

export interface MyVerificationStatus {
  ok: boolean
  verified: boolean
  via: VerifiedVia | null
  verified_at: string | null
  verified_until: string | null
  on_hold: boolean
  lapsed: boolean
  /** Trusted-domain label, institution or organisation name behind the badge. */
  label: string | null
  renew_email: string | null
  renew_method: 'email' | 'code' | null
}

export function useMyVerificationStatus(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.detail('verification-status', userId),
    queryFn: async (): Promise<MyVerificationStatus | null> => {
      const { data, error } = await (supabase as any).rpc('get_my_verification_status')
      if (isMissing(error)) return null
      if (error) throw error
      return (data as MyVerificationStatus) ?? null
    },
    enabled: !!userId,
    staleTime: 60_000,
  })
  return { status: query.data ?? null, loading: query.isPending }
}

export interface MyVerificationEvent {
  event: string
  via: VerifiedVia | null
  reason: string | null
  created_at: string
}

export function useMyVerificationHistory(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.list('verification-events', { mine: userId }),
    queryFn: async (): Promise<MyVerificationEvent[] | null> => {
      const { data, error } = await (supabase as any).rpc('get_my_verification_history', { p_limit: 20 })
      if (isMissing(error)) return null
      if (error) throw error
      return (data as MyVerificationEvent[]) ?? []
    },
    enabled: !!userId,
  })
  return { history: query.data ?? null, loading: query.isPending }
}

export type RedeemReason =
  | 'invalid_code'
  | 'rate_limited'
  | 'on_hold'
  | 'email_unconfirmed'
  | 'unauthenticated'

export interface RedeemResult {
  ok: boolean
  reason?: RedeemReason
  outcome?: 'verified' | 'renewed'
  org_name?: string
  granted_role?: string | null
}

export function useRedeemVerificationCode() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (code: string): Promise<RedeemResult> => {
      const { data, error } = await (supabase as any).rpc('redeem_verification_code', { p_code: code })
      if (error) throw error
      return (data as RedeemResult) ?? { ok: false, reason: 'invalid_code' }
    },
    onSuccess: (result) => {
      if (result.ok) invalidateAll(queryClient)
    },
  })
  return { redeem: mutation.mutateAsync, loading: mutation.isPending }
}

// ---------------------------------------------------------------------------
// Organisations issuing codes
// ---------------------------------------------------------------------------

export type OrgKind = 'institution' | 'employer'

export interface IssuingOrg {
  org_kind: OrgKind
  org_id: string
  org_name: string
  allowed_roles: string[]
}

export function useMyCodeIssuingOrgs(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.list('verification-codes', { issuer: userId }),
    queryFn: async (): Promise<IssuingOrg[] | null> => {
      const { data, error } = await (supabase as any).rpc('get_my_code_issuing_orgs')
      if (isMissing(error)) return null
      if (error) throw error
      return (data as IssuingOrg[]) ?? []
    },
    enabled: !!userId,
  })
  return { orgs: query.data ?? null, loading: query.isPending }
}

export type CodeStatus = 'unused' | 'redeemed' | 'expired' | 'revoked'

export interface OrgCode {
  id: string
  code_hint: string
  label: string
  intended_email: string | null
  grants_role: string | null
  issued_by_name: string | null
  issued_at: string
  expires_at: string
  status: CodeStatus
  redeemed_by: string | null
  redeemed_by_name: string | null
  redeemed_at: string | null
  member_verified: boolean
}

export function useOrgVerificationCodes(kind: OrgKind | undefined, orgId: string | undefined) {
  const query = useQuery({
    queryKey: keys.list('verification-codes', { kind, orgId }),
    queryFn: async (): Promise<OrgCode[]> => {
      const { data, error } = await (supabase as any).rpc('list_org_verification_codes', {
        p_org_kind: kind,
        p_org_id: orgId,
      })
      if (isMissing(error)) return []
      if (error) throw error
      return (data as OrgCode[]) ?? []
    },
    enabled: !!kind && !!orgId,
  })
  return { codes: query.data ?? [], loading: query.isPending, refetch: query.refetch }
}

export interface IssueCodeInput {
  kind: OrgKind
  orgId: string
  label: string
  intendedEmail?: string
  grantsRole?: string
  validDays?: number
}

export interface IssueCodeResult {
  ok: boolean
  reason?: string
  id?: string
  code?: string
  expires_at?: string
  org_name?: string
}

export function useIssueVerificationCode() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (input: IssueCodeInput): Promise<IssueCodeResult> => {
      const { data, error } = await (supabase as any).rpc('issue_verification_code', {
        p_org_kind: input.kind,
        p_org_id: input.orgId,
        p_label: input.label,
        p_intended_email: input.intendedEmail || null,
        p_grants_role: input.grantsRole || null,
        p_valid_days: input.validDays ?? 14,
      })
      if (error) throw error
      return (data as IssueCodeResult) ?? { ok: false }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all('verification-codes') }),
  })
  return { issue: mutation.mutateAsync, loading: mutation.isPending }
}

export function useRevokeVerificationCode() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (codeId: string): Promise<{ ok: boolean; reason?: string }> => {
      const { data, error } = await (supabase as any).rpc('revoke_verification_code', { p_code_id: codeId })
      if (error) throw error
      return data ?? { ok: false }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all('verification-codes') }),
  })
  return { revokeCode: mutation.mutateAsync, loading: mutation.isPending }
}

export function useWithdrawOrgVouch() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc('withdraw_org_vouch', {
        p_user: userId,
        p_reason: reason,
      })
      if (error) throw error
      return (data as { ok: boolean; reason?: string }) ?? { ok: false }
    },
    onSuccess: () => invalidateAll(queryClient),
  })
  return { withdraw: mutation.mutateAsync, loading: mutation.isPending }
}

// ---------------------------------------------------------------------------
// Reviewers
// ---------------------------------------------------------------------------

export interface AdminCode {
  id: string
  org_kind: OrgKind
  org_id: string
  org_name: string | null
  code_hint: string
  label: string
  grants_role: string | null
  issued_by_name: string | null
  issued_at: string
  expires_at: string
  status: CodeStatus
  redeemed_by_name: string | null
  redeemed_at: string | null
}

export function useAllVerificationCodes(status: CodeStatus | '' = '') {
  const query = useQuery({
    queryKey: keys.list('verification-codes', { all: true, status }),
    queryFn: async (): Promise<AdminCode[] | null> => {
      const { data, error } = await (supabase as any).rpc('list_all_verification_codes', {
        p_status: status || null,
        p_limit: 200,
      })
      if (isMissing(error)) return null
      if (error) throw error
      return (data as AdminCode[]) ?? []
    },
  })
  return { codes: query.data ?? null, loading: query.isPending }
}

export interface VerificationEventRow {
  id: string
  user_id: string
  event: string
  via: VerifiedVia | null
  actor_id: string | null
  reason: string | null
  evidence: Record<string, unknown>
  created_at: string
  user?: { display_name: string | null } | null
  actor?: { display_name: string | null } | null
}

export function useVerificationEvents(filters: { event?: string; userId?: string } = {}) {
  const query = useQuery({
    queryKey: keys.list('verification-events', filters),
    queryFn: async (): Promise<VerificationEventRow[] | null> => {
      // Two foreign keys to profiles, so both embeds name their constraint
      // (a bare profiles(*) here is a PGRST201). display_name only: the hold
      // column is not granted, so the panel reads the hold from the event.
      let q = (supabase.from('verification_events' as any) as any)
        .select(
          'id, user_id, event, via, actor_id, reason, evidence, created_at, ' +
            'user:profiles!verification_events_user_id_fkey(display_name), ' +
            'actor:profiles!verification_events_actor_id_fkey(display_name)'
        )
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters.event) q = q.eq('event', filters.event)
      if (filters.userId) q = q.eq('user_id', filters.userId)
      const { data, error } = await q
      if (error?.code === '42P01' || isMissing(error)) return null
      if (error) throw error
      return (data as VerificationEventRow[]) ?? []
    },
  })
  return { events: query.data ?? null, loading: query.isPending, refetch: query.refetch }
}

const REVOKE_MESSAGES: Record<string, string> = {
  forbidden: 'You cannot change verification.',
  self: 'You cannot revoke your own verification.',
  reason_required: 'Give a reason of at least 10 characters. The member sees it.',
  seat_requires_super_admin: 'Only a Super Admin can change verification on an admin account.',
  not_found: 'Member not found.',
  not_on_hold: 'This account is not on hold.',
}

export function useRevokeVerification() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async ({ userId, reason, hold = true }: { userId: string; reason: string; hold?: boolean }) => {
      const { data, error } = await (supabase as any).rpc('revoke_verification', {
        p_user: userId,
        p_reason: reason,
        p_hold: hold,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(REVOKE_MESSAGES[data?.reason] || 'Could not revoke verification.')
      return data
    },
    onSuccess: () => invalidateAll(queryClient),
  })
  return { revoke: mutation.mutateAsync, loading: mutation.isPending }
}

export function useClearVerificationHold() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc('clear_verification_hold', {
        p_user: userId,
        p_reason: reason,
      })
      if (error) throw error
      if (!data?.ok) throw new Error(REVOKE_MESSAGES[data?.reason] || 'Could not lift the hold.')
      return data
    },
    onSuccess: () => invalidateAll(queryClient),
  })
  return { clearHold: mutation.mutateAsync, loading: mutation.isPending }
}
