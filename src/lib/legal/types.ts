/**
 * The shape of a published legal document.
 *
 * Data modules rather than TSX or markdown, for three reasons that all bite:
 * `lingui extract` cannot see markdown at all; JSX turns a 17-section policy
 * into 17 enormous messages with embedded markup, which is the shape
 * translators reliably corrupt; and neither gives a programmatic section list,
 * which is what the table of contents, the SpyRail and site search all read.
 *
 * Kept React-free on purpose. api/ai-search.ts already imports site-map.ts under
 * the same constraint, and a future consent-audit endpoint will want the section
 * list without pulling in a renderer.
 */

export type LegalDocumentKey =
  // Core
  | 'terms'
  | 'privacy'
  | 'cookies'
  | 'content-licence'
  | 'acceptable-use'
  | 'ai-disclosure'
  | 'copyright'
  | 'safeguarding'
  | 'funding-disclaimer'
  // IP extension
  | 'competition-ip'
  | 'application-confidentiality'
  | 'trademark'
  | 'code-contribution'
  | 'partner-api'

/**
 * Which consent bundle a document belongs to — the gating unit. A member is
 * asked for a bundle where it is relevant (publishing terms at the first
 * publish), never for all fourteen documents at once. Mirrored by
 * `legal_documents.bundle` in migration 115.
 */
export type LegalBundle =
  | 'account'
  | 'publishing'
  | 'competition'
  | 'application'
  | 'informational'

export type LegalBlock =
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered?: boolean; items: string[] }
  | { kind: 'note'; tone?: 'info' | 'warn'; text: string }
  | { kind: 'defs'; items: { term: string; def: string }[] }
  /**
   * `rows` are objects, not `string[][]`. The harvester's walk returns early on
   * a non-object, so a bare array-of-arrays-of-strings is never reached by the
   * key allowlist and the whole table would silently render in English.
   */
  | { kind: 'table'; columns: string[]; rows: { cells: string[] }[] }

export interface LegalSection {
  /** URL fragment, SpyRail id and table-of-contents anchor. Stable — deep links depend on it. */
  id: string
  heading: string
  /** Short form for the SpyRail pill, which is one nowrap line. Falls back to `heading`. */
  railLabel?: string
  /** One-line gist. Shown under the heading in the consent panel; indexed by site search. */
  summary?: string
  body: LegalBlock[]
  /** Link row rendered under the section. Never put markup inside prose. */
  actions?: { label: string; href: string }[]
}

export interface LegalDocument {
  key: LegalDocumentKey
  /**
   * Positive integer, not semver. Consent is recorded against an exact version
   * and the ordering has to be unambiguous when deciding whether a member owes
   * a re-acceptance.
   */
  version: number
  /** ISO date. Must equal `legal_documents.effective_date` for this version. */
  effectiveDate: string
  title: string
  summary: string
  bundle: LegalBundle
  /** Rendered as a "See also" block. Keeps one clause in exactly one document. */
  relatedKeys?: LegalDocumentKey[]
  sections: LegalSection[]
}
