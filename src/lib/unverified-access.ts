/**
 * Which routes an unverified, signed-in account may open (migration 205).
 *
 * A route object in App.tsx says so through its `handle`:
 *   UNVERIFIED_OK  open to an unverified account
 *   UNVERIFIED_NO  walled for an unverified account
 *
 * The deepest match that says anything decides. Two guards read it, with
 * opposite defaults:
 *
 *   - ProtectedRoute and AccountRoute (members-only pages) are default-DENY:
 *     only UNVERIFIED_OK opens one. A new members-only route nobody thought
 *     about is walled, which is the safe way round.
 *   - MainLayout (public pages a guest can read) is default-ALLOW: only
 *     UNVERIFIED_NO walls one, so the homepage, help and legal pages never
 *     need marking.
 *
 * The database is the authority on what an unverified account may DO. This
 * only decides what it is shown.
 */

export interface UnverifiedHandle {
  unverified?: boolean
}

export const UNVERIFIED_OK: UnverifiedHandle = { unverified: true }
export const UNVERIFIED_NO: UnverifiedHandle = { unverified: false }

interface MatchLike {
  handle?: unknown
}

/** The deepest explicit rule, or undefined when no matched route has one. */
export function unverifiedRule(matches: readonly MatchLike[]): boolean | undefined {
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle as UnverifiedHandle | undefined
    if (handle && typeof handle.unverified === 'boolean') return handle.unverified
  }
  return undefined
}

/** Members-only routes: open only when explicitly marked. */
export function allowsUnverified(matches: readonly MatchLike[]): boolean {
  return unverifiedRule(matches) === true
}

/** Public routes: walled only when explicitly marked. */
export function blocksUnverified(matches: readonly MatchLike[]): boolean {
  return unverifiedRule(matches) === false
}
