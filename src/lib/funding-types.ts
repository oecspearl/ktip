import { msg } from '@lingui/core/macro'

/**
 * The instrument a funding call offers.
 *
 * Migration 137. Distinct from grant_type (003), which is the focus area --
 * a research grant and a research-stage venture round are the same focus and
 * different money, and an applicant needs to know which before they read a
 * line of the eligibility.
 *
 * Values mirror the CHECK constraint in 137. Adding one here without adding it
 * there fails the insert at the database, which is the intended direction: the
 * constraint is the vocabulary, this file is its copy.
 */
export const FUNDING_TYPES = [
  { value: 'grant', label: msg`Grant` },
  { value: 'venture_capital', label: msg`Venture capital` },
  { value: 'angel', label: msg`Angel investment` },
  { value: 'private_equity', label: msg`Private equity` },
  { value: 'debt', label: msg`Loan or debt financing` },
  { value: 'convertible', label: msg`Convertible note` },
  { value: 'prize', label: msg`Prize or competition award` },
  { value: 'in_kind', label: msg`In-kind support` },
  { value: 'blended', label: msg`Blended finance` },
  { value: 'other', label: msg`Other funding` },
] as const

/** Every value the CHECK constraint admits — what the AI extractor is held to. */
export const FUNDING_TYPE_VALUES = FUNDING_TYPES.map((t) => t.value)

/**
 * English labels for the surfaces that render outside a lingui context -- the
 * admin table, hero details, the seeded homepage payload. Same words as
 * FUNDING_TYPES, untranslated.
 */
export const FUNDING_TYPE_LABELS: Record<string, string> = {
  grant: 'Grant',
  venture_capital: 'Venture capital',
  angel: 'Angel investment',
  private_equity: 'Private equity',
  debt: 'Loan or debt financing',
  convertible: 'Convertible note',
  prize: 'Prize or competition award',
  in_kind: 'In-kind support',
  blended: 'Blended finance',
  other: 'Other funding',
}

/** Grouped by family: non-dilutive sand, equity ocean, everything else neutral. */
export const FUNDING_TYPE_COLORS: Record<string, string> = {
  grant: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  venture_capital: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  angel: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  private_equity: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  convertible: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  debt: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  blended: 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200',
  prize: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200',
  in_kind: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
  other: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
}

/**
 * Null for a row that has no instrument — the column is NOT NULL, but the
 * homepage hero seed is a hand-picked subset of columns and older payloads do
 * not carry it, so callers must be able to leave the field out rather than
 * label a venture round "Grant". An unknown value reads as itself.
 */
export function fundingTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return FUNDING_TYPE_LABELS[value] || value.replace(/_/g, ' ')
}
