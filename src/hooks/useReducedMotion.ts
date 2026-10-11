import { useCallback, useSyncExternalStore } from 'react'
import { prefersReducedMotionNow, setA11ySettings, useA11ySettings } from '../a11y/viridion'

/**
 * The member's own "reduce motion" switch, independent of the OS setting.
 *
 * Toggles `html.reduce-motion`, which index.css treats exactly like the media
 * query: keyframes off, transitions off, marquees become scrollable rows.
 * Stored, painted before first render, and synced by the accessibility service.
 */
export function useReducedMotionPref(): [boolean, (on: boolean) => void] {
  const on = useA11ySettings().reduceMotion
  const setOn = useCallback((next: boolean) => setA11ySettings({ reduceMotion: next }), [])
  return [on, setOn]
}

const QUERY = '(prefers-reduced-motion: reduce)'
const subscribeOs = (listener: () => void) => {
  const mq = window.matchMedia?.(QUERY)
  mq?.addEventListener?.('change', listener)
  return () => mq?.removeEventListener?.('change', listener)
}

/**
 * Should motion be reduced right now? True for the OS setting OR the member's
 * own switch. For JS-driven motion — the hero's auto-rotate, inline
 * transitions — that the CSS blocks cannot reach.
 */
export function useReducedMotion(): boolean {
  // Re-render on the member's switch and on the OS setting alike
  useA11ySettings()
  return useSyncExternalStore(subscribeOs, prefersReducedMotionNow, () => false)
}
