/**
 * Email-domain helpers for the verification tracks (migration 145).
 *
 * Client-side mirrors only. The database is the authority: the free-mail
 * denylist below is the same list as the CHECK on trusted_email_domains, and
 * exists so the admin form can say "no" before the round trip.
 */

/** Same list as trusted_email_domains_not_freemail in migration 145. */
export const FREE_MAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'fastmail.com',
  'hey.com',
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/

/** Lowercased, trimmed, or null when it is not an address at all. */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) return null
  return email
}

/** The part after the @, lowercased; null when there is no usable domain. */
export function emailDomain(raw: string): string | null {
  const email = normaliseEmail(raw)
  if (!email) return null
  return email.split('@')[1] ?? null
}

/**
 * A bare domain as the trusted-domains form accepts it: trimmed, lowercased,
 * a leading @ tolerated. Null when it cannot be a domain, or is a free-mail
 * provider (the database refuses those too).
 */
export function normaliseTrustedDomain(raw: string): string | null {
  const domain = raw.trim().toLowerCase().replace(/^@/, '')
  if (!DOMAIN_RE.test(domain) || domain.length > 253) return null
  if (isFreeMailDomain(domain)) return null
  return domain
}

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.includes(domain.trim().toLowerCase())
}

/**
 * Splits a pasted roster into addresses: one per line, or comma / semicolon
 * separated, or a CSV column where the address is whichever cell parses as
 * one. Returns unique normalised addresses and the count of cells dropped.
 */
export function parseRosterInput(raw: string): { emails: string[]; skipped: number } {
  const seen = new Set<string>()
  let skipped = 0
  for (const cell of raw.split(/[\n,;]+/)) {
    const trimmed = cell.trim().replace(/^"|"$/g, '')
    if (!trimmed) continue
    const email = normaliseEmail(trimmed)
    if (!email) {
      skipped += 1
      continue
    }
    seen.add(email)
  }
  return { emails: [...seen], skipped }
}
