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

  return {
    addAlias: addMutation.mutateAsync,
    removeAlias: removeMutation.mutateAsync,
    loading: addMutation.isPending || removeMutation.isPending,
    error: addMutation.error || removeMutation.error,
  }
}
