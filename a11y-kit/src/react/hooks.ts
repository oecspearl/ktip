import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { A11ySettings, DeviceState, StoredState } from '../core/config'
import type { A11yStore } from '../core/store'
import { useResolvedStore } from './context'

export function useA11yState(store?: A11yStore): StoredState {
  const s = useResolvedStore(store)
  return useSyncExternalStore(s.subscribe, s.getState, s.getState)
}

export function useA11ySettings(store?: A11yStore): A11ySettings {
  return useA11yState(store).settings
}

export function useA11yDevice(store?: A11yStore): DeviceState {
  return useA11yState(store).device
}

/** One setting and its setter, e.g. `const [scale, setScale] = useA11ySetting('fontScale')`. */
export function useA11ySetting<K extends keyof A11ySettings>(
  key: K,
  store?: A11yStore
): [A11ySettings[K], (value: A11ySettings[K]) => void] {
  const s = useResolvedStore(store)
  const value = useA11ySettings(s)[key]
  const set = useCallback((next: A11ySettings[K]) => s.patch({ [key]: next } as Partial<A11ySettings>), [s, key])
  return [value, set]
}

const MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** OS setting OR the member's own switch, live. For JS-driven motion. */
export function useReducedMotion(store?: A11yStore): boolean {
  const pref = useA11ySettings(store).reduceMotion
  const [os, setOs] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(MOTION_QUERY).matches
  )
  useEffect(() => {
    const mq = window.matchMedia?.(MOTION_QUERY)
    if (!mq) return
    const update = () => setOs(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  return os || pref
}
