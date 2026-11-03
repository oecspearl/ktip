/**
 * Client-side arithmetic for the verification term (migration 175).
 * The server decides when a badge lapses; this only decides what to show.
 */

/** The renewal prompt appears this many days before the term ends, matching the first reminder. */
export const RENEWAL_WINDOW_DAYS = 30

/** Whole days until `iso`, rounded up; zero or negative once it has passed. NULL for no date. */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - now
  if (Number.isNaN(ms)) return null
  return Math.ceil(ms / 86_400_000)
}

/** True when the term ends inside the renewal window (or has already ended). */
export function inRenewalWindow(iso: string | null | undefined, now: number = Date.now()): boolean {
  const days = daysUntil(iso, now)
  return days !== null && days <= RENEWAL_WINDOW_DAYS
}

/**
 * What a member typed, reduced to the 12 characters the server hashes —
 * the client mirror of normalise_verification_code() in 176. Used only to
 * tell the member early that a string cannot be a code.
 */
export function normaliseVerificationCode(input: string): string | null {
  let v = input.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  // A code body never contains I, so a leading KTIP is always the prefix.
  if (v.startsWith('KTIP')) v = v.slice(4)
  v = v.replace(/[IL]/g, '1').replace(/O/g, '0')
  if (v.length !== 12 || /[^0-9A-HJKMNP-TV-Z]/.test(v)) return null
  return v
}
