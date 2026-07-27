/**
 * Force-clear all Supabase session data from localStorage.
 *
 * This bypasses the Supabase client entirely, which is necessary when
 * the client's internal auth lock is stuck (e.g., a hanging token refresh
 * from a stale/corrupt session blocks all subsequent auth operations).
 */
export function clearSupabaseSession() {
  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (key.startsWith('sb-')) {
      localStorage.removeItem(key)
    }
  }
}

/**
 * Check if there's a truly stale/corrupt Supabase session in localStorage.
 *
 * IMPORTANT: Access tokens expire every ~1 hour — that's NORMAL. The Supabase
 * client refreshes them automatically using the refresh token. We must NOT
 * clear sessions just because the access token expired.
 *
 * Only returns true for sessions that are genuinely unrecoverable:
 * - Missing refresh token (can't refresh)
 * - Missing or malformed access token (corrupt data)
 * - Access token expired more than 7 days ago (refresh token almost certainly expired too)
 */
export function hasStaleSession(): boolean {
  const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60

  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw)

        // No refresh token — can't recover this session
        if (!parsed?.refresh_token) return true

        const token = parsed?.access_token
        if (!token) return true

        // Decode JWT payload (base64url) to check expiry
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        const exp = payload.exp

        // Only stale if expired for more than 7 days (refresh token is dead too)
        if (exp && Date.now() / 1000 > exp + SEVEN_DAYS_SECONDS) {
          return true
        }
      } catch {
        // Malformed/corrupt session data — clear it
        return true
      }
    }
  }
  return false
}
