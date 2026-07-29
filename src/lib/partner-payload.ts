/**
 * The wire contract for the outbound employer feed.
 *
 * Lives in src/lib rather than api/ for the same reason extracted-fields.ts
 * does: vitest.config.ts only collects `src/**\/*.test.ts`, so shaping logic
 * placed here is testable while the edge handler stays a thin transport shell.
 * Nothing in this file is React- or Node-specific.
 *
 * ── The rule this file exists to enforce ──────────────────────────────────
 * Every field is named twice: once in PARTNER_EMPLOYER_SELECT (what leaves the
 * database) and once in toPartnerEmployer (what leaves the process). There is
 * no spread, no `select('*')`, no passthrough. A column added to `employers`
 * next year is therefore excluded by default — the failure mode of a
 * mistake here is a missing field, not a leaked one.
 *
 * NEVER add to either list: verification_note (internal reviewer commentary),
 * document_paths or any signed URL into the private verification-documents
 * bucket, verified_by / created_by (identifies OECS staff), contact_phone,
 * share_externally.
 */

/** Explicit column list for the PostgREST query. Embeds the country parent. */
export const PARTNER_EMPLOYER_SELECT = [
  'id',
  'slug',
  'legal_name',
  'trading_name',
  'industry',
  'website_url',
  'logo_url',
  'description',
  'country_code',
  'administrative_area',
  'locality',
  'address_line1',
  'address_line2',
  'postal_code',
  'contact_email',
  'contact_email_verified_at',
  'verification_status',
  'verification_method',
  'registration_number',
  'verified_at',
  'document_count',
  'created_at',
  'updated_at',
  'country:countries(code,name)',
].join(',')

/**
 * Column list for the first pass, which decides WHICH rows the caller may see.
 * Carries no PII: the handler runs this over the whole change window, then
 * re-queries the qualifying ids with PARTNER_EMPLOYER_SELECT. A row that fails
 * the gate never has its contact details read out of the database at all.
 */
export const PARTNER_WINDOW_SELECT =
  'id,slug,verification_status,share_externally,verified_at,updated_at'

export interface PartnerWindowRow {
  id: string
  slug: string
  verification_status: string
  share_externally: boolean
  verified_at: string | null
  updated_at: string
}

/** A row currently eligible for the feed. */
export function isShareable(row: PartnerWindowRow): boolean {
  return row.verification_status === 'verified' && row.share_externally === true
}

/**
 * A row that used to be eligible and no longer is — it was verified at some
 * point (verified_at survives revocation) but fails the gate now.
 */
export function isTombstone(row: PartnerWindowRow): boolean {
  return !isShareable(row) && row.verified_at !== null
}

export interface PartnerEmployerRow {
  id: string
  slug: string
  legal_name: string
  trading_name: string | null
  industry: string | null
  website_url: string | null
  logo_url: string | null
  description: string | null
  country_code: string
  administrative_area: string | null
  locality: string | null
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  contact_email: string
  contact_email_verified_at: string | null
  verification_status: string
  verification_method: string | null
  registration_number: string | null
  verified_at: string | null
  document_count: number | null
  created_at: string
  updated_at: string
  country?: { code: string; name: string } | null
}

export interface PartnerEmployer {
  id: string
  slug: string
  legal_name: string
  trading_name: string | null
  industry: string | null
  website_url: string | null
  logo_url: string | null
  description: string | null
  address: {
    country: { code: string; name: string | null }
    administrative_area: string | null
    locality: string | null
    line1: string | null
    line2: string | null
    postal_code: string | null
  }
  contact_email: string | null
  contact_email_verified: boolean
  verification: {
    status: string
    method: string | null
    verified_at: string | null
    registration_number: string | null
    evidence_document_count: number
  }
  created_at: string
  updated_at: string
}

/** Tombstone for a row that has left the feed — see toRemovedEmployer. */
export interface PartnerRemovedEmployer {
  id: string
  slug: string
  removed: true
  updated_at: string
}

const nullable = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Row -> wire object. Field-by-field by design; see the header note.
 *
 * `contact_email` is the one piece of genuine PII in the payload, so it is
 * emitted only when the address has actually been confirmed. An unverified
 * contact address is a string somebody typed, and shipping it to a third party
 * would forward an unchecked claim about a mailbox that may not be theirs.
 */
export function toPartnerEmployer(row: PartnerEmployerRow): PartnerEmployer {
  const emailVerified = Boolean(row.contact_email_verified_at)

  return {
    id: row.id,
    slug: row.slug,
    legal_name: row.legal_name,
    trading_name: nullable(row.trading_name),
    industry: nullable(row.industry),
    website_url: nullable(row.website_url),
    logo_url: nullable(row.logo_url),
    description: nullable(row.description),
    address: {
      country: {
        code: row.country_code,
        name: row.country?.name ?? null,
      },
      administrative_area: nullable(row.administrative_area),
      locality: nullable(row.locality),
      line1: nullable(row.address_line1),
      line2: nullable(row.address_line2),
      postal_code: nullable(row.postal_code),
    },
    contact_email: emailVerified ? row.contact_email : null,
    contact_email_verified: emailVerified,
    verification: {
      status: row.verification_status,
      method: nullable(row.verification_method),
      verified_at: row.verified_at,
      registration_number: nullable(row.registration_number),
      evidence_document_count: row.document_count ?? 0,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Tombstone for an employer that has dropped out of the feed.
 *
 * Without this, an incremental consumer polling `updated_since` can never learn
 * that a row was revoked: a revoked employer simply stops matching the filter,
 * so it never appears again and the partner's copy lives forever under a
 * verified badge we have withdrawn. Deletions have to be transmitted, not
 * inferred from absence.
 */
export function toRemovedEmployer(row: {
  id: string
  slug: string
  updated_at: string
}): PartnerRemovedEmployer {
  return { id: row.id, slug: row.slug, removed: true, updated_at: row.updated_at }
}
