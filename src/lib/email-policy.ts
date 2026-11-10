/**
 * The secondary-email rule (migration 204): every account keeps a second
 * address, and at least one of the two is not a school address. A school
 * inbox is switched off when the student leaves, and an account whose only
 * addresses were school ones cannot be recovered after that.
 *
 * The database is the authority — is_school_email() also knows every domain
 * listed on an institution. This mirror only has the shape test, so the forms
 * can answer instantly; the server's `school` flag (api/auth/email-available)
 * is OR-ed in when it arrives, and api/auth/add-alias refuses the pair anyway.
 */

import { canCheckEmail } from './email-available'

/** Same pattern as is_school_email() in migration 204. */
const SCHOOL_DOMAIN_RE = /(^|\.)edu$|\.edu\.[a-z]{2}$|\.ac\.[a-z]{2}$|\.sch\.[a-z]{2}$|(^|\.)k12\./

export function looksLikeSchoolDomain(domain: string): boolean {
  return SCHOOL_DOMAIN_RE.test(domain.trim().toLowerCase())
}

export function looksLikeSchoolEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1]
  return !!domain && looksLikeSchoolDomain(domain)
}

export type SecondaryEmailProblem = 'missing' | 'invalid' | 'same' | 'both_school'

/**
 * What is wrong with a primary/secondary pair, or undefined when nothing is.
 * `primarySchool` / `secondarySchool` are the server's answers where known;
 * the shape test fills in either way.
 */
export function secondaryEmailProblem(input: {
  primary: string
  secondary: string
  primarySchool?: boolean
  secondarySchool?: boolean
}): SecondaryEmailProblem | undefined {
  const primary = input.primary.trim().toLowerCase()
  const secondary = input.secondary.trim().toLowerCase()
  if (!secondary) return 'missing'
  if (!canCheckEmail(secondary)) return 'invalid'
  if (secondary === primary) return 'same'
  const primarySchool = !!input.primarySchool || looksLikeSchoolEmail(primary)
  const secondarySchool = !!input.secondarySchool || looksLikeSchoolEmail(secondary)
  if (primarySchool && secondarySchool) return 'both_school'
  return undefined
}
