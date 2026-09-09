import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { EMAIL_CODE_RESEND_SECONDS } from '../lib/mfa'
import type { MfaBackupCodeStatus, MfaEmailSessionStatus, MfaFactorSummary } from '../types'

/**
 * Two-factor enrolment (118), wrapped over Supabase's native MFA, plus the
 * email-code alternative (150) that sits beside it.
 *
 * Only TOTP is a GoTrue factor. Supabase's phone factor is a paid add-on and
 * SMS to OECS carriers costs real money per message; an authenticator app costs
 * nothing and works offline. The email code is not a GoTrue factor at all — it
 * is an application-level step-up (see migration 150) for the member with no
 * smartphone, and it goes through our own RPCs and edge function.
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
    // Verifying a factor flips mfa_method to totp server-side (150).
    queryClient.invalidateQueries({ queryKey: keys.all('mfa-email') })
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
      queryClient.invalidateQueries({ queryKey: keys.all('mfa-email') })
    },
  })
}

// ---------------------------------------------------------------------------
// The email code (150)
// ---------------------------------------------------------------------------

/**
 * Whether THIS session has a live email step-up. Session state, like the
 * assurance level: the same account on another device gets its own answer.
 * A missing RPC (app deployed ahead of 150) reads as null, which every caller
 * treats as "nothing owed".
 */
export function useMfaEmailStatus(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.detail('mfa-email', userId),
    queryFn: async (): Promise<MfaEmailSessionStatus | null> => {
      const { data, error } = await (supabase as any).rpc('mfa_email_session_status')
      if (error) return null
      return (data as MfaEmailSessionStatus | null) ?? null
    },
    enabled: !!userId,
  })
  return { status: query.data ?? null, loading: query.isPending, refetch: query.refetch }
}

export interface EmailCodeSendResult {
  ok: true
  expires_at: string
  /** Present only outside production when Resend is unconfigured. */
  dev_code?: string
}

export interface EmailCodeVerifyResult {
  ok: true
  expires_at: string
  first_time: boolean
}

export function useMfaEmailMutations(userId?: string) {
  const { t } = useLingui()
  const queryClient = useQueryClient()

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: keys.all('mfa-email') })
    if (userId) queryClient.invalidateQueries({ queryKey: ['profile', userId] })
  }, [queryClient, userId])

  /**
   * Ask for a code. Goes through an edge function because the plaintext must
   * never reach the browser that holds the password — the RPC that mints it is
   * service-role only, and the mail goes to the account's own address.
   */
  const sendMutation = useMutation({
    mutationFn: async (): Promise<EmailCodeSendResult> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(t`No active session`)

      const failed = t`We could not send a code. Try again in a moment.`
      const res = await fetch('/api/auth/mfa-email-send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const body = await res.json().catch(() => ({ error: failed }))
      if (!res.ok) throw new Error(body.error || failed)
      return body as EmailCodeSendResult
    },
  })

  /**
   * Spend the code. Runs on the caller's own session — verify_mfa_email_code()
   * needs nothing the browser lacks — and on a first-time choice signs every
   * other session out, which is what GoTrue does when a factor first verifies.
   */
  const verifyMutation = useMutation({
    mutationFn: async (code: string): Promise<EmailCodeVerifyResult> => {
      const { data, error } = await (supabase as any).rpc('verify_mfa_email_code', { p_code: code })
      if (error) throw error
      const result = data as { ok: boolean; reason?: string; expires_at?: string; first_time?: boolean }
      if (!result?.ok) {
        if (result?.reason === 'rate_limited') {
          throw new Error(t`Too many attempts. Wait a while and try again.`)
        }
        if (result?.reason === 'totp_enrolled') {
          throw new Error(t`This account uses an authenticator app. Enter the code from the app instead.`)
        }
        if (result?.reason === 'not_authenticated') {
          throw new Error(t`Your session has ended. Sign in again.`)
        }
        throw new Error(t`That code was not accepted. Check the digits, or send a new code.`)
      }
      if (result.first_time) {
        await supabase.auth.signOut({ scope: 'others' }).catch(() => {
          /* best effort */
        })
      }
      return { ok: true, expires_at: result.expires_at ?? '', first_time: !!result.first_time }
    },
    onSuccess: invalidate,
  })

  /**
   * Switch the email method off, for an account that chose it. The RPC refuses
   * when a role requires a second step, and when this session has not itself
   * verified a code — the same rule GoTrue applies to removing a factor.
   */
  const disableMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('disable_my_mfa_email')
      if (error) throw error
      const result = data as { ok: boolean; reason?: string }
      if (!result?.ok) {
        if (result?.reason === 'required') {
          throw new Error(t`Your account needs a second step at sign-in, so this cannot be switched off.`)
        }
        if (result?.reason === 'step_up_required') {
          throw new Error(t`Sign out and back in with a fresh email code, then try again.`)
        }
        throw new Error(t`Could not switch off email codes.`)
      }
    },
    onSuccess: invalidate,
  })

  return {
    sendCode: sendMutation.mutateAsync,
    verifyCode: verifyMutation.mutateAsync,
    disableEmail: disableMutation.mutateAsync,
    sending: sendMutation.isPending,
    verifying: verifyMutation.isPending,
    disabling: disableMutation.isPending,
    resendSeconds: EMAIL_CODE_RESEND_SECONDS,
  }
}
