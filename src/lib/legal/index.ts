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
// The text-free half lives in manifest.ts so the consent code that runs on
// every page can import it without pulling in the documents themselves.
export {
  LEGAL_MANIFEST,
  CONSENT_BUNDLES,
  PROMPTED_BUNDLES,
  bundleVersion,
  isPromptedBundle,
  legalPath,
} from './manifest'
export type { PromptedBundle } from './manifest'
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

export function documentsInBundle(bundle: LegalBundle): LegalDocument[] {
  return LEGAL_DOCUMENTS.filter((doc) => doc.bundle === bundle)
}
