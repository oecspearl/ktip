/**
 * A suspended member's session is held on one page (migration 184).
 *
 * Suspension no longer bans the login. The database already refuses every
 * action through has_permission(), so the client's job is to stop the member
 * wandering a site that silently does nothing, and to show them why and how to
 * appeal. These helpers are the whole rule, kept pure so the guard in
 * MainLayout, the one in ProtectedRoute and the tests cannot disagree.
 */

export interface Suspension {
  /** As stored. Read through isSuspendedNow(), which applies the end date. */
  isSuspended: boolean
  /** ISO timestamp, or null for "until further notice". */
  until: string | null
  reason: string | null
  /** When the suspension was logged, or null when the log predates 184. */
  since: string | null
}

/** Where a suspended session is held. Bare route, outside MainLayout. */
export const SUSPENDED_PATH = '/account/suspended'

/**
 * The same rule is_suspended() applies in SQL (063): suspended, and either no
 * end date or an end date still ahead. Nothing sweeps the flag back to false
 * when the date passes, so the date has to be read every time.
 */
export function isSuspendedNow(suspension: Suspension | null | undefined, now: Date = new Date()): boolean {
  if (!suspension?.isSuspended) return false
  if (!suspension.until) return true
  const ends = Date.parse(suspension.until)
  // An unreadable date is treated as no end date: the server decides either
  // way, and failing open here would show a locked-out member a dead site.
  if (Number.isNaN(ends)) return true
  return ends > now.getTime()
}

/**
 * Paths a suspended member may still open. The policies they agreed to, so the
 * reason can be checked against them, and the page itself.
 */
export function isSuspensionExemptPath(pathname: string): boolean {
  if (pathname === SUSPENDED_PATH) return true
  if (pathname === '/legal' || pathname.startsWith('/legal/')) return true
  // Redirect spellings of two legal pages (App.tsx).
  return pathname === '/terms' || pathname === '/privacy'
}

/** Where to send this session, or null to let it through. */
export function suspensionRedirect(
  pathname: string,
  suspension: Suspension | null | undefined,
  now: Date = new Date()
): string | null {
  if (!isSuspendedNow(suspension, now)) return null
  if (isSuspensionExemptPath(pathname)) return null
  return SUSPENDED_PATH
}

/** What my_suspension() returns (184). */
export interface MySuspensionRow {
  is_suspended?: boolean | null
  suspended_until?: string | null
  suspension_reason?: string | null
  suspended_at?: string | null
}

/** The RPC row, or the profile columns when the RPC is not deployed. */
export function toSuspension(row: MySuspensionRow | null | undefined): Suspension | null {
  if (!row) return null
  return {
    isSuspended: row.is_suspended === true,
    until: row.suspended_until ?? null,
    reason: row.suspension_reason ?? null,
    since: row.suspended_at ?? null,
  }
}
