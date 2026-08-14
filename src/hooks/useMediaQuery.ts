import { useEffect, useState } from 'react'

/**
 * Breakpoint state as data, so JS can make the decisions CSS already makes.
 *
 * The app had no hook of this kind: every mobile adaptation was a Tailwind
 * class (`hidden sm:flex`), which changes what is *painted* and nothing about
 * what is *mounted or executed*. A phone therefore ran the desktop app in full
 * and then hid parts of it — SpyRail is the clearest case, measuring scroll
 * offsets on every frame behind `hidden sm:flex`.
 *
 * Prefer a CSS class when the answer is purely visual. Reach for these when the
 * cost is work rather than pixels.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    // matchMedia is missing under jsdom unless a test stubs it; treating that
    // as "desktop, no match" keeps every gate below on its full-fidelity path,
    // which is the branch the existing tests were written against.
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    // Re-read on subscribe: the query can have changed between the initial
    // useState and this effect (a prop-driven query, or a rotation during
    // hydration).
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Phone-width layout. Matches Tailwind's `md` breakpoint, so it agrees with the classes. */
export const MOBILE_QUERY = '(max-width: 767px)'

/**
 * "Cheap effects, please."
 *
 * Phone widths, plus touch devices up to tablet size. The second clause is
 * what catches an iPad — full desktop width, no mouse, and a GPU that a
 * full-viewport `backdrop-filter` will still punish. It is capped at 1279px so
 * a touchscreen laptop stays on the desktop path: those have the power to run
 * the full treatment, and silently downgrading them would be the "desktop
 * changed" regression this gate exists to avoid.
 */
export const MOBILE_LITE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-width: 1279px)'

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

/**
 * True where the expensive visual treatments should be skipped: the route card
 * shuffle, the frosted blur copies, the aurora blobs, per-frame scroll
 * sampling. Desktop keeps all of it.
 */
export function useMobileLite(): boolean {
  return useMediaQuery(MOBILE_LITE_QUERY)
}

/**
 * One-shot read for callers outside React — `enableCardShuffle` runs once at
 * module setup, before any component mounts, and only needs the answer for the
 * session. A device that changes category mid-session (rotation into a
 * different query result) is not worth a live subscription there: the value
 * decides whether to install a navigate() wrapper at all.
 */
export function isMobileLite(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(MOBILE_LITE_QUERY).matches
}
