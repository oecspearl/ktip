import { useEffect, useSyncExternalStore } from 'react'

/**
 * Whether a FloatingActionButton is on screen. The FAB carries the
 * accessibility panel on every MainLayout page; A11yQuickButton fills in on
 * the pages without one (sign-in, sign-up, onboarding, MFA), so the controls
 * are reachable before a member has an account.
 */
let mounted = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Call from the FAB. */
export function useRegisterFab() {
  useEffect(() => {
    mounted++
    emit()
    return () => {
      mounted--
      emit()
    }
  }, [])
}

export function useFabPresent(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => mounted > 0,
    () => true
  )
}
