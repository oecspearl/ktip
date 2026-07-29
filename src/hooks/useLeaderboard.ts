import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardWindow,
  MyLeaderboardRank,
} from '../types'

export interface LeaderboardFilters {
  scope: LeaderboardScope
  /** Country code or role slug; ignored when scope is 'global'. */
  value?: string | null
  window: LeaderboardWindow
  limit?: number
}

/**
 * The board.
 *
 * Aggregation happens entirely in get_leaderboard(): the engagement tables it
 * reads are RLS-scoped to their owner, so a client-side sum is not merely
 * slower, it is impossible. The function also owns the exclusions — students
 * (safeguarding), members who opted out, and suspended accounts — so no
 * filtering here can accidentally widen them.
 */
export function useLeaderboard(filters: LeaderboardFilters) {
  // A country or role board with nothing selected would silently fall back to
  // global, which reads as a bug to the user. Wait for the value instead.
  const ready = filters.scope === 'global' || !!filters.value

  const query = useQuery({
    queryKey: keys.list('leaderboard', filters),
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data, error } = await (supabase as any).rpc('get_leaderboard', {
        p_scope: filters.scope,
        p_value: filters.value ?? null,
        p_window: filters.window,
        p_limit: filters.limit ?? 50,
      })
      if (error) throw error
      return (data as LeaderboardEntry[]) || []
    },
    enabled: ready,
    staleTime: 60_000,
  })

  return {
    entries: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * The signed-in member's own standing.
 *
 * Separate from the board because it is returned even when the member is
 * outside the top N and even when they have opted out — `listed: false` means
 * "this is your score, and nobody else can see it".
 */
export function useMyRank(filters: LeaderboardFilters, enabled: boolean) {
  const ready = enabled && (filters.scope === 'global' || !!filters.value)

  const query = useQuery({
    queryKey: keys.sub('leaderboard', 'my-rank', JSON.stringify(filters)),
    queryFn: async (): Promise<MyLeaderboardRank | null> => {
      const { data, error } = await (supabase as any).rpc('get_my_leaderboard_rank', {
        p_scope: filters.scope,
        p_value: filters.value ?? null,
        p_window: filters.window,
      })
      if (error) throw error
      return (data as MyLeaderboardRank) || null
    },
    enabled: ready,
    staleTime: 60_000,
  })

  return {
    myRank: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
