import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ktip_motion'
const SYNC_EVENT = 'ktip-motion-change'
const CLASS = 'reduce-motion'
const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * The member's own "reduce motion" switch, independent of the OS setting.
 *
 * Toggles `html.reduce-motion`, which index.css treats exactly like the media
 * query: keyframes off, transitions off, marquees become scrollable rows.
 * Applied pre-render by the inline script in index.html; synced across mounted
 * instances and to the profile (155) the same way theme and readable are.
 */
export function useReducedMotionPref(): [boolean, (on: boolean) => void] {
  const [on, setOnState] = useState(() => document.documentElement.classList.contains(CLASS))

  useEffect(() => {
    const onSync = (e: Event) => setOnState((e as CustomEvent<boolean>).detail)
    window.addEventListener(SYNC_EVENT, onSync)
    return () => window.removeEventListener(SYNC_EVENT, onSync)
  }, [])

  const setOn = (next: boolean) => {
    document.documentElement.classList.toggle(CLASS, next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // localStorage unavailable — the preference still applies this session
    }
    setOnState(next)
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }))
  }

  return [on, setOn]
}

/**
 * Should motion be reduced right now? True for the OS setting OR the member's
 * own switch. For JS-driven motion — the hero's auto-rotate, inline
 * transitions — that the CSS blocks cannot reach.
 */
export function useReducedMotion(): boolean {
  const [pref] = useReducedMotionPref()
  const [os, setOs] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches
  )
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const update = () => setOs(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return os || pref
}
