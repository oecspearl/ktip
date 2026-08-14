import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import { useAuth } from '../contexts/AuthContext'
import type { ModerationRule } from '../lib/moderation/types'

/**
 * The filter rules the browser is allowed to see, for live highlighting.
 *
 * Deliberately NOT persisted. React Query's in-memory cache is session-scoped
 * and dies on reload; a slur list written to localStorage sits on the disk of
 * whatever shared school computer the member happened to use, which is a
 * support incident waiting to happen. Re-fetching once per page load costs one
 * small RPC.
 *
 * Nothing is gated on this succeeding. An error or an empty list means
 * scanText() returns no matches and every form behaves exactly as it did
 * before the feature existed.
 */

// Stable identity matters: scan.ts caches its combined alternations in a
// WeakMap keyed by this array, so a fresh [] per render would rebuild every
// matcher on every keystroke.
const EMPTY: ModerationRule[] = []

export function useModerationRules() {
  const auth = useAuth()

  const query = useQuery({
    queryKey: keys.list('moderation-rules'),
    // Not granted to anon, and a signed-out visitor cannot write content anyway.
    enabled: Boolean(auth.user),
    queryFn: async (): Promise<ModerationRule[]> => {
      const { data, error } = await (supabase as any).rpc('get_client_moderation_rules')
      if (error) throw error
      return (data as ModerationRule[]) || []
    },
    // The list changes when a moderator edits it, which is rare and never
    // urgent. A member whose tab has been open an hour scanning against a
    // slightly stale list is not a problem a round trip per hour solves —
    // and the server is the enforcement boundary regardless.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
  })

  return { rules: query.data ?? EMPTY, loading: query.isPending }
}