import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { keys } from '../queries/keys'
import type {
  AchievementCheckResult,
  TrackableFlag,
  TrophyAsset,
  TrophyAssetMap,
} from '../types'

/**
 * The achievement engine is "pull, not push": every call to
 * check_my_achievements() re-derives the member's counts server-side and
 * awards anything whose threshold is met. That makes calls cheap to repeat,
 * idempotent, and safe to fire liberally — which is what the debounce and the
 * fallback poll below rely on.
 *
 * The RPC takes no user argument; it derives the caller from auth.uid(). There
 * is no client write path to user_badges, so nothing here can award anything.
 */

const CHECK_KEY = keys.sub('achievements', 'check')

async function runCheck(): Promise<AchievementCheckResult> {
  const { data, error } = await (supabase as any).rpc('check_my_achievements')
  if (error) throw error
  return data as AchievementCheckResult
}

/**
 * The member's own achievement state.
 *
 * `refetchInterval` is the safety net: tools call triggerCheck() after their
 * save actions, but coverage does not need to be perfect because a missed
 * award is picked up within two minutes.
 */
export function useMyAchievements(enabled: boolean) {
  const query = useQuery({
    queryKey: CHECK_KEY,
    queryFn: runCheck,
    enabled,
    staleTime: 60_000,
    // Awards are not time-critical; tools call triggerCheck() after saves, so
    // a long interval only bounds how late a *missed* award can surface.
    refetchInterval: 600_000,
    refetchOnWindowFocus: false,
  })

  return {
    achievements: query.data,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Debounced manual check, for calling after a save.
 *
 * A single user action often writes several rows (create a project, add
 * members, upload an image), and each one wants to trigger a check. The 300 ms
 * window collapses those into one round trip.
 */
export function useAchievementCheck() {
  const queryClient = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mutation = useMutation({
    mutationFn: runCheck,
    onSuccess: (result) => {
      queryClient.setQueryData(CHECK_KEY, result)
      // A new badge changes what the profile, directory and leaderboard show.
      if (result?.newly_earned?.length) {
        queryClient.invalidateQueries({ queryKey: keys.all('badges') })
        queryClient.invalidateQueries({ queryKey: keys.all('leaderboard') })
        queryClient.invalidateQueries({ queryKey: keys.all('notifications') })
      }
    },
  })

  const { mutateAsync } = mutation

  const triggerCheck = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      // Fire and forget: a failed check is retried by the poll, and an
      // achievement popup is never worth surfacing an error toast for.
      void mutateAsync().catch(() => {})
    }, 300)
  }, [mutateAsync])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { triggerCheck, checking: mutation.isPending }
}

/**
 * Trophy artwork, shared across every badge of the same type and tier.
 *
 * Art changes when an admin uploads a new file, which is rare, so this is
 * cached hard — the alternative is refetching 52 rows on every gallery mount.
 */
export function useTrophyAssets() {
  const query = useQuery({
    queryKey: keys.list('trophy_assets'),
    queryFn: async (): Promise<TrophyAsset[]> => {
      const { data, error } = await (supabase as any)
        .from('trophy_assets')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data as TrophyAsset[]) || []
    },
    staleTime: Infinity,
  })

  const assetMap = useMemo<TrophyAssetMap>(() => {
    const map: TrophyAssetMap = {}
    for (const asset of query.data || []) {
      if (!map[asset.type]) map[asset.type] = {}
      map[asset.type][asset.tier] = asset
    }
    return map
  }, [query.data])

  return {
    assets: query.data,
    assetMap,
    loading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * How many members hold each badge, and the membership that is measured
 * against — the "4 of 27 members" line on the trophy detail card.
 *
 * One RPC for every badge rather than one per trophy: the detail popup opens
 * on any of 68 tiles, and a per-badge call would be a round trip on every
 * click for a figure that barely moves.
 *
 * Five minutes rather than Infinity: unlike trophy artwork this genuinely
 * drifts as members earn things, and a stale count is a wrong claim about
 * other people rather than a stale picture.
 *
 * Fails soft. If 103_badge_holder_counts.sql has not been applied the RPC is
 * missing, and the card drops the row instead of showing a zero — see
 * holderText() in TrophyCard.
 */
export function useBadgeHolderCounts() {
  const query = useQuery({
    queryKey: keys.list('badge_holder_counts'),
    queryFn: async (): Promise<{ badge_id: string; holders: number; eligible: number }[]> => {
      const { data, error } = await (supabase as any).rpc('get_badge_holder_counts')
      if (error) throw error
      return (data as { badge_id: string; holders: number; eligible: number }[]) || []
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const holdersById = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of query.data || []) map.set(row.badge_id, Number(row.holders) || 0)
    return map
  }, [query.data])

  // Repeated on every row by the function, so any row carries it.
  const eligible = query.data?.[0]?.eligible

  return {
    holdersById,
    eligible: eligible == null ? undefined : Number(eligible),
    loading: query.isPending,
    error: query.error,
  }
}

/** Up to five trophies pinned to a member's public profile. */
export function useShowcaseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    // The server truncates to five and drops any badge the member has not
    // earned, so an over-long or optimistic list is corrected, not rejected.
    mutationFn: async (badgeIds: string[]) => {
      const { error } = await (supabase as any).rpc('set_my_showcase', {
        p_badge_ids: badgeIds.slice(0, 5),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all('profile_stats') })
    },
  })
}

/**
 * Report a signal the database cannot derive on its own — which pages the
 * member opened. Deliberately fire-and-forget: this powers a handful of
 * hidden achievements and must never interrupt navigation.
 */
export function useTrackFlag() {
  return useCallback((flag: TrackableFlag, value = 1) => {
    void (supabase as any)
      .rpc('track_my_flag', { p_key: flag, p_mode: 'increment', p_value: value })
      .then(() => {})
      .catch(() => {})
  }, [])
}
