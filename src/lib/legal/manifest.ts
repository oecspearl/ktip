import type { LegalBundle, LegalDocumentKey } from './types'

/**
 * Which documents exist, which bundle each belongs to, and its version, with
 * none of the text.
 *
 * The consent machinery that runs on every page (useAgreementGate, the
 * re-consent banner) only ever needs these three facts. Importing them from
 * the index pulled every document's full text into the entry chunk, about
 * 105 kB before gzip, on every page load for every visitor.
 *
 * Kept by hand, so it can drift from the documents. legal-content.test.ts
 * fails the build if any key, bundle, version or the order differs from
 * LEGAL_DOCUMENTS. When you bump a document's version, bump it here too.
 */
export const LEGAL_MANIFEST: ReadonlyArray<{
  key: LegalDocumentKey
  bundle: LegalBundle
  version: number
}> = [
  { key: 'terms', bundle: 'account', version: 1 },
  { key: 'privacy', bundle: 'account', version: 1 },
  { key: 'acceptable-use', bundle: 'account', version: 1 },
  { key: 'safeguarding', bundle: 'account', version: 1 },
  { key: 'content-licence', bundle: 'publishing', version: 1 },
  { key: 'copyright', bundle: 'publishing', version: 1 },
  { key: 'competition-ip', bundle: 'competition', version: 1 },
  { key: 'application-confidentiality', bundle: 'application', version: 1 },
  { key: 'cookies', bundle: 'informational', version: 1 },
  { key: 'ai-disclosure', bundle: 'informational', version: 1 },
  { key: 'funding-disclaimer', bundle: 'informational', version: 1 },
  { key: 'trademark', bundle: 'informational', version: 1 },
  { key: 'code-contribution', bundle: 'informational', version: 1 },
  { key: 'partner-api', bundle: 'informational', version: 1 },
]

/** Route for a document page. One place, so the footer, site map and See-also cannot drift apart. */
export function legalPath(key: LegalDocumentKey): string {
  return `/legal/${key}`
}

/**
 * Which documents each consent bundle covers — the answer to "what does Accept
 * All accept".
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
for (const doc of LEGAL_MANIFEST) CONSENT_BUNDLES[doc.bundle].push(doc.key)

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
  const docs = LEGAL_MANIFEST.filter((d) => d.bundle === bundle)
  return docs.length > 0 ? Math.max(...docs.map((d) => d.version)) : 0
}
