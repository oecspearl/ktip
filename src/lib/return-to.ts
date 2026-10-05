/**
 * Where a member was headed when sign-in interrupted them.
 *
 * ProtectedRoute hands /login a `state.from`, but router state does not survive
 * the OAuth round trip — Google sends the browser to /auth/callback as a fresh
 * page load. So LoginPage writes the path here on arrival, and whichever page
 * finishes the sign-in (LoginPage itself, AuthCallbackPage, OnboardingPage for a
 * first-time OAuth account) takes it back out.
 *
 * sessionStorage, not localStorage: the intent belongs to this tab, and a
 * leftover from last week must not steer today's sign-in.
 */

const KEY = 'ktip.return-to'

/**
 * Pages a sign-in must never land back on: the auth screens themselves and the
 * gates ProtectedRoute redirects to. Landing on one is a loop at best.
 */
const NEVER_RETURN_TO = ['/login', '/signup', '/auth/', '/onboarding', '/security/']

/**
 * Same-origin, app-relative, and not an auth or gate page. A leading `//` or
 * `/\` is a protocol-relative URL to another host — the open redirect this
 * exists to refuse.
 */
export function isSafeReturnPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path.startsWith('/')) return false
  if (path.startsWith('//') || path.startsWith('/\\')) return false
  return !NEVER_RETURN_TO.some((p) =>
    p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)
  )
}

/**
 * Record where to go after sign-in. An absent or unsafe `from` CLEARS the slot
 * rather than leaving it, so a plain visit to /login cannot be hijacked by an
 * abandoned attempt earlier in the same tab.
 */
export function rememberReturnTo(
  from?: { pathname?: string; search?: string; hash?: string } | null
): void {
  const path = from?.pathname ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : null
  try {
    if (isSafeReturnPath(path)) sessionStorage.setItem(KEY, path)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked (private mode, strict settings): sign-in lands on home.
  }
}

/** Read and clear. Re-checked on the way out — storage is writable by any script on the origin. */
export function takeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return isSafeReturnPath(path) ? path : null
  } catch {
    return null
  }
}
