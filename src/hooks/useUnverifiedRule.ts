import { useContext } from 'react'
import { UNSAFE_DataRouterStateContext } from 'react-router'
import { unverifiedRule } from '../lib/unverified-access'

/**
 * The current route's rule for an unverified account (205): true (open),
 * false (walled), undefined (no route says), or null (no data router).
 *
 * Reads the full match list from the data router's state rather than through
 * useMatches(), which throws outside a data router. The app always runs under
 * createBrowserRouter, so in the app the answer is never null. Component tests
 * that render a guard under MemoryRouter get null, and the guard does not
 * gate: there is no route metadata to go on.
 *
 * The database refuses what an unverified account may not do either way, so
 * that null can only ever show a page, never let an action through.
 */
export function useUnverifiedRule(): boolean | undefined | null {
  const state = useContext(UNSAFE_DataRouterStateContext)
  if (!state) return null
  return unverifiedRule(state.matches.map((m) => ({ handle: m.route.handle })))
}

/**
 * Members-only guards: should this unverified account see the wall here?
 * Default-deny. Only a route marked UNVERIFIED_OK opens.
 */
export function useWallForUnverified(): boolean {
  const rule = useUnverifiedRule()
  return rule !== null && rule !== true
}

/**
 * Public layout: should this unverified account see the wall here?
 * Default-allow. Only a route marked UNVERIFIED_NO walls.
 */
export function useWallPublicForUnverified(): boolean {
  return useUnverifiedRule() === false
}
