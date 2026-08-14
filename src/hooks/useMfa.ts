import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { MfaBackupCodeStatus, MfaFactorSummary } from '../types'

/**
 * Two-factor enrolment (118), wrapped over Supabase's native MFA.
 *
 * Only TOTP is used. Supabase's phone factor is a paid add-on and SMS to OECS
 * carriers costs real money per message; an authenticator app costs nothing and
 * works offline, which matters more here than it would elsewhere.
 */

/** Verified TOTP factors on the signed-in account. */
export function useMfaFactors(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.detail('mfa-factors', userId),
    queryFn: async (): Promise<MfaFactorSummary[]> => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      // `.totp` is the verified-only view; `.all` includes half-finished
      // enrolments, which are housekeeping rather than something to show.
      return (data?.totp ?? []).map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name ?? null,
        status: factor.status,
        createdAt: factor.created_at,
      }))
    },
    enabled: !!userId,
  })

  return {
    factors: query.data ?? [],
    enrolled: (query.data ?? []).length > 0,
    loading: query.isPending,
    error: query.error,
  }
}

/** How many recovery codes are left. Counts only — the RPC never returns hashes. */
export function useBackupCodeStatus(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.detail('mfa-backup-codes', userId),
    queryFn: async (): Promise<MfaBackupCodeStatus> => {
      const { data, error } = await (supabase as any).rpc('mfa_backup_code_status')
      if (error) throw error
      return (data as MfaBackupCodeStatus) ?? { total: 0, remaining: 0, issued_at: null }
    },
    enabled: !!userId,
  })

  return { status: query.data ?? null, loading: query.isPending, error: query.error }
}

export function useMfaMutations(userId?: string) {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: keys.all('mfa-factors') })
    queryClient.invalidateQueries({ queryKey: keys.all('mfa-backup-codes') })
    if (userId) queryClient.invalidateQueries({ queryKey: ['profile', userId] })
  }, [queryClient, userId])

  /**
   * Start an enrolment, clearing any half-finished ones first.
   *
   * That cleanup is not optional. Every enroll() call persists an UNVERIFIED
   * factor, so a member who reloads this screen a few times silently fills
   * GoTrue's per-user factor limit (10 by default) and then cannot enrol at all,
   * with an error that explains none of it.
   */
  const enrollMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase.auth.mfa.listFactors()
      for (const factor of existing?.all ?? []) {
        if (factor.factor_type === 'totp' && factor.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: factor.id })
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        // GoTrue rejects a duplicate friendly name, and the cleanup above only
        // clears unverified factors — a member adding a second device would
        // otherwise collide with their first.
        friendlyName: `KTIP ${new Date().toISOString()}`,
        issuer: 'KTIP',
      })
      if (error) throw error
      return {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      }
    },
  })

  /** Verify the six digits and promote this session to aal2. */
  const verifyMutation = useMutation({
    mutationFn: async ({ factorId, code }: { factorId: string; code: string }) => {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) throw error
      // The gate reads profiles.requires_mfa_enrollment, and nothing writes it
      // on the SQL side — there is no trigger on auth.mfa_factors (see 118).
      // Without this the member finishes enrolling and stays stuck on the setup
      // page until their next sign-in.
      await (supabase as any).rpc('ensure_my_mfa_status')
    },
    onSuccess: invalidate,
  })

  /**
   * Mint ten recovery codes. Returns the plaintext ONCE — it is never
   * retrievable again, and the caller must show it before navigating away.
   */
  const issueCodesMutation = useMutation({
    mutationFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any).rpc('issue_mfa_backup_codes')
      if (error) throw error
      const result = data as { ok: boolean; reason?: string; codes?: string[] }
      if (!result?.ok) {
        if (result?.reason === 'step_up_required') {
          throw new Error(t`Verify your authenticator app before generating recovery codes.`)
        }
        if (result?.reason === 'rate_limited') {
          throw new Error(t`Too many attempts. Try again tomorrow.`)
        }
        throw new Error(t`Could not generate recovery codes.`)
      }
      return result.codes ?? []
    },
    onSuccess: invalidate,
  })

  /** Remove a factor from Settings. Not the recovery path — that runs server-side. */
  const unenrollMutation = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      await (supabase as any).rpc('ensure_my_mfa_status')
    },
    onSuccess: invalidate,
  })

  return {
    enroll: enrollMutation.mutateAsync,
    verify: verifyMutation.mutateAsync,
    issueCodes: issueCodesMutation.mutateAsync,
    unenroll: unenrollMutation.mutateAsync,
    enrolling: enrollMutation.isPending,
    verifying: verifyMutation.isPending,
    issuing: issueCodesMutation.isPending,
    unenrolling: unenrollMutation.isPending,
  }
}

/**
 * Spend a recovery code. Goes through an edge function rather than straight to
 * the RPC, because deleting the lost factor afterwards needs the service role —
 * the member's own aal1 session cannot do it.
 */
export function useMfaRecovery() {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (code: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(t`No active session`)

      const failed = t`That code was not accepted.`
      const res = await fetch('/api/auth/mfa-recover', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      })
      const body = await res.json().catch(() => ({ error: failed }))
      if (!res.ok) throw new Error(body.error || failed)
      return body as { ok: true; remaining: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('mfa-factors') })
      queryClient.invalidateQueries({ queryKey: keys.all('mfa-backup-codes') })
    },
  })
}
