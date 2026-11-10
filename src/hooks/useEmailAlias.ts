import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { UserEmailAlias } from '../types'

/**
 * The caller's secondary email address, if they have one.
 *
 * Deliberately kept out of AuthContext: AuthProvider wraps every route
 * including public ones, so a query there would cost a request on every page
 * load for a value exactly one settings card reads.
 */
export function useMyEmailAlias(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.detail('email-alias', userId),
    queryFn: async (): Promise<UserEmailAlias | null> => {
      // Explicit column list, never '*'. RLS is column-blind, so the owner can
      // read their own verification_token — it just has no business sitting in
      // browser memory.
      const { data, error } = await (supabase.from('user_email_aliases') as any)
        .select('id, user_id, email, verified_at, token_expires_at, created_at')
        .eq('user_id', userId as string)
        .maybeSingle()

      if (error) throw error
      return (data as UserEmailAlias) ?? null
    },
    enabled: !!userId,
  })

  return { alias: query.data ?? null, loading: query.isPending, error: query.error }
}

/** my_secondary_email_status() (204). */
export interface SecondaryEmailStatus {
  has_secondary: boolean
  secondary_email: string | null
  verified: boolean
  pending_live: boolean
  primary_school: boolean
  secondary_school: boolean
  compliant: boolean
}

/**
 * Where the signed-in account stands against the secondary-email rule (204).
 * Read by ProtectedRoute, which only renders for signed-in sessions, so public
 * pages never pay for it. Keyed under 'email-alias' so every alias mutation
 * refreshes it with the same invalidation.
 */
export function useSecondaryEmailStatus(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('email-alias', 'status', userId),
    queryFn: async (): Promise<SecondaryEmailStatus> => {
      const { data, error } = await (supabase.rpc as any)('my_secondary_email_status')
      if (error) throw error
      return data as SecondaryEmailStatus
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    // A failed check lets the member through (see ProtectedRoute); retrying
    // a missing function on every navigation would only add latency.
    retry: 1,
  })

  return { status: query.data ?? null, loading: query.isPending && !!userId, error: query.error }
}

export function useEmailAliasMutations() {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.all('email-alias') })
  }

  /** Adds a new alias, changes a pending one, or resends its link — one endpoint. */
  const addMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(t`No active session`)

      const res = await fetch('/api/auth/add-alias', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const failedToSave = t`Failed to save the address`
      const body = await res.json().catch(() => ({ error: failedToSave }))
      if (!res.ok) throw new Error(body.error || failedToSave)
      return body as { success: true; dev_link?: string; already_verified?: boolean }
    },
    onSuccess: invalidate,
  })

  /** Owner-only DELETE policy covers this — no endpoint needed. */
  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase.from('user_email_aliases') as any)
        .delete()
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  /**
   * Swaps a verified alias for a new address. add-alias refuses while a
   * verified one is on file, so it is removed first. If the add then fails the
   * account has no secondary, and ProtectedRoute asks for one: never stuck.
   */
  //
  // The delete goes straight to the table rather than through removeMutation:
  // that one invalidates on success, and the refreshed status would bounce a
  // Settings visitor to the gate between the two halves of the swap.
  const replaceAlias = async (userId: string, email: string) => {
    const { error } = await (supabase.from('user_email_aliases') as any)
      .delete()
      .eq('user_id', userId)
    if (error) throw error
    try {
      return await addMutation.mutateAsync(email)
    } catch (err) {
      invalidate()
      throw err
    }
  }

  return {
    addAlias: addMutation.mutateAsync,
    removeAlias: removeMutation.mutateAsync,
    replaceAlias,
    loading: addMutation.isPending || removeMutation.isPending,
    error: addMutation.error || removeMutation.error,
  }
}
