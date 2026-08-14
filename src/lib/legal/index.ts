/**
 * The published legal documents, and the bundles that gate them.
 *
 * This is the module `scripts/i18n/harvest.mjs` loads — it walks the exported
 * values and writes every string reached by the allowlist into
 * `src/i18n/harvested.ts`, where `lingui extract` finds it. The harvester
 * dedupes across re-exports, so listing the documents once here is enough.
 */
import type { LegalBundle, LegalDocument, LegalDocumentKey } from './types'

import { TERMS } from './terms'
import { PRIVACY } from './privacy'
import { ACCEPTABLE_USE } from './acceptable-use'
import { SAFEGUARDING } from './safeguarding'
import { CONTENT_LICENCE } from './content-licence'
import { COPYRIGHT } from './copyright'
import { COMPETITION_IP } from './competition-ip'
import { APPLICATION_CONFIDENTIALITY } from './application-confidentiality'
import { COOKIES } from './cookies'
import { AI_DISCLOSURE } from './ai-disclosure'
import { FUNDING_DISCLAIMER } from './funding-disclaimer'
import { TRADEMARK } from './trademark'
import { CODE_CONTRIBUTION } from './code-contribution'
import { PARTNER_API } from './partner-api'

export * from './types'
export { LEGAL_TOKENS, fillTokens, extractTokens } from './parties'
export type { LegalToken } from './parties'

/**
 * Ordered for the index page: the bundles a member is actually asked to accept
 * come first, informational reference last.
 */
export const LEGAL_DOCUMENTS: LegalDocument[] = [
  TERMS,
  PRIVACY,
  ACCEPTABLE_USE,
  SAFEGUARDING,
  CONTENT_LICENCE,
  COPYRIGHT,
  COMPETITION_IP,
  APPLICATION_CONFIDENTIALITY,
  COOKIES,
  AI_DISCLOSURE,
  FUNDING_DISCLAIMER,
  TRADEMARK,
  CODE_CONTRIBUTION,
  PARTNER_API,
]

const BY_KEY = new Map<LegalDocumentKey, LegalDocument>(
  LEGAL_DOCUMENTS.map((doc) => [doc.key, doc])
)

export function getLegalDocument(key: LegalDocumentKey): LegalDocument | undefined {
  return BY_KEY.get(key)
}

/** Route for a document page. One place, so the footer, site map and See-also cannot drift apart. */
export function legalPath(key: LegalDocumentKey): string {
  return `/legal/${key}`
}

/**
 * Which documents each consent bundle covers — the answer to "what does Accept
 * All accept". Derived from the documents themselves so a document cannot be in
 * a bundle here and a different one in its own definition.
 *
 * The DB is still the authority on the VERSION accepted (see `record_consent` in
 * migration 115, which reads the version server-side rather than taking it from
 * the client). This map only says which keys to name.
 */
export const CONSENT_BUNDLES: Record<LegalBundle, LegalDocumentKey[]> = {
  account: [],
  publishing: [],
  competition: [],
  application: [],
  informational: [],
}
for (const doc of LEGAL_DOCUMENTS) CONSENT_BUNDLES[doc.bundle].push(doc.key)

/** Bundles a member is asked to accept. `informational` is published, never prompted. */
export const PROMPTED_BUNDLES = [
  'account',
  'publishing',
  'competition',
  'application',
] as const satisfies readonly LegalBundle[]

export type PromptedBundle = (typeof PROMPTED_BUNDLES)[number]

export function isPromptedBundle(bundle: LegalBundle): bundle is PromptedBundle {
  return (PROMPTED_BUNDLES as readonly LegalBundle[]).includes(bundle)
}

export function documentsInBundle(bundle: LegalBundle): LegalDocument[] {
  return LEGAL_DOCUMENTS.filter((doc) => doc.bundle === bundle)
}

/**
 * The version the client believes is current for a bundle, sent to
 * `record_consent` as `p_expected_version` so that a client running against a
 * database that has already moved on fails loudly instead of recording consent
 * to text nobody was shown.
 *
 * Every document in a bundle is expected to share a version — they are revised
 * and re-accepted together. `legal-content.test.ts` enforces that.
 */
export function bundleVersion(bundle: LegalBundle): number {
  const docs = documentsInBundle(bundle)
  return docs.length > 0 ? Math.max(...docs.map((d) => d.version)) : 0
}
