import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type { ProfileStats, ProfileStatsRow } from '../types'

/**
 * Points, rank and pinned trophies for one member's public profile.
 *
 * Anonymous-callable: /u/:id has to render for a signed-out visitor following
 * a shared link, which is the whole reason the page exists. Returns null for
 * suspended accounts rather than an empty shell.
 */
export function useProfileStats(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.sub('profile_stats', 'detail', userId),
    queryFn: async (): Promise<ProfileStats | null> => {
      const { data, error } = await (supabase as any).rpc('get_profile_stats', {
        p_user: userId,
      })
      if (error) throw error
      return (data as ProfileStats) || null
    },
    enabled: !!userId,
    staleTime: 60_000,
  })

  return {
    stats: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Batched points and level for many members at once — directory cards and
 * leaderboard rows would otherwise fire one request per row.
 *
 * The SQL caps at 200 ids; requests are chunked to match rather than being
 * silently truncated, following get_connection_counts() in migration 049.
 */
export function useProfileStatsBatch(userIds: string[] | undefined) {
  // Stable key and stable input: a fresh array identity on every render would
  // otherwise refetch continuously.
  const ids = useMemo(() => Array.from(new Set(userIds || [])).sort(), [userIds])

  const query = useQuery({
    queryKey: keys.sub('profile_stats', 'batch', ids.join(',')),
    queryFn: async (): Promise<Record<string, ProfileStatsRow>> => {
      const out: Record<string, ProfileStatsRow> = {}

      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        const { data, error } = await (supabase as any).rpc('get_profile_stats_batch', {
          p_user_ids: chunk,
        })
        if (error) throw error
        for (const row of (data as ProfileStatsRow[]) || []) {
          out[row.user_id] = row
        }
      }

      return out
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  })

  return {
    statsById: query.data || {},
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
