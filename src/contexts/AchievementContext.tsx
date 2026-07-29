import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { useAchievementCheck, useMyAchievements, useTrophyAssets } from '../hooks/useAchievements'
import type {
  AchievementCheckResult,
  NewlyEarnedAchievement,
  TrophyAssetMap,
} from '../types'

/**
 * Holds the unlock queue and exposes the trigger every tool calls after a save.
 *
 * The queue exists because one action can unlock several achievements at once
 * (create a fifth project and you may cross a tier, a collection and a points
 * threshold in the same call). Showing three modals stacked is unreadable, so
 * they are shown one at a time.
 *
 * The server is the sole authority on what is new: `newly_earned` is only
 * non-empty on the call that actually inserted the row. There is deliberately
 * NO client-side "already seen" filter in localStorage — the reference
 * implementation had one and it silently suppressed popups forever whenever
 * storage and the database drifted apart.
 */

interface AchievementContextValue {
  achievements: AchievementCheckResult | undefined
  loading: boolean
  assetMap: TrophyAssetMap
  pendingUnlocks: NewlyEarnedAchievement[]
  dismissUnlock: () => void
  triggerCheck: () => void
}

const AchievementContext = createContext<AchievementContextValue | undefined>(undefined)

export function AchievementProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const enabled = !!auth.user?.id

  const { achievements, loading } = useMyAchievements(enabled)
  const { triggerCheck } = useAchievementCheck()
  const { assetMap } = useTrophyAssets()

  const [pendingUnlocks, setPendingUnlocks] = useState<NewlyEarnedAchievement[]>([])
  // Slugs already queued this session. Guards against a refetch replaying the
  // same payload — not against the database, which stays authoritative.
  const queuedSlugs = useRef<Set<string>>(new Set())

  useEffect(() => {
    const earned = achievements?.newly_earned
    if (!earned?.length) return

    const fresh = earned.filter((a) => !queuedSlugs.current.has(a.slug))
    if (!fresh.length) return

    fresh.forEach((a) => queuedSlugs.current.add(a.slug))
    setPendingUnlocks((queue) => [...queue, ...fresh])
  }, [achievements])

  // Signing out must not leave another account's unlocks queued.
  useEffect(() => {
    if (!enabled) {
      queuedSlugs.current.clear()
      setPendingUnlocks([])
    }
  }, [enabled])

  const dismissUnlock = useCallback(() => {
    setPendingUnlocks((queue) => queue.slice(1))
  }, [])

  const value = useMemo(
    () => ({ achievements, loading, assetMap, pendingUnlocks, dismissUnlock, triggerCheck }),
    [achievements, loading, assetMap, pendingUnlocks, dismissUnlock, triggerCheck]
  )

  return <AchievementContext.Provider value={value}>{children}</AchievementContext.Provider>
}

export function useAchievementContext(): AchievementContextValue {
  const context = useContext(AchievementContext)
  if (!context) {
    throw new Error('useAchievementContext must be used inside AchievementProvider')
  }
  return context
}

/**
 * The one-liner tools call after a save.
 *
 * Returns a no-op outside the provider so a component can call it
 * unconditionally without knowing whether achievements are mounted — an
 * achievement check is never important enough to crash a save flow over.
 */
export function useAchievementTrigger(): () => void {
  const context = useContext(AchievementContext)
  return useCallback(() => {
    context?.triggerCheck()
  }, [context])
}
