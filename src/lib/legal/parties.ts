/**
 * The named parties, addresses and periods that every legal document refers to.
 *
 * NOT harvested for translation — these are proper nouns, addresses and email
 * addresses, and a translated contact address is a broken contact address. The
 * renderer substitutes `%token%` into body text after `i18n._()` resolves the
 * message, and `legal-i18n.test.ts` asserts each fr/es translation carries the
 * same token multiset as its English source, so a translator cannot drop one.
 *
 * Percent delimiters rather than braces, and that is not cosmetic: a harvested
 * string reaches `i18n._()` as an ICU message, where `{entity}` is a PLACEHOLDER.
 * With no matching value it renders empty, silently deleting the subject of a
 * clause — and ICU also treats `'` as an escape character, so an apostrophe
 * before a brace would mangle the rest of the sentence. `%entity%` has no meaning
 * to ICU at all.
 *
 * One module rather than repeated literals: these are the `[BRACKET]`
 * placeholders from docs/PRIVACY-AND-TERMS.md, and there are fourteen documents
 * that would otherwise each need editing when the registered address changes.
 *
 * REVIEW BEFORE LAUNCH — every value below is a working default, not a legal
 * determination. `jurisdiction`, `copyrightAgent` and the two retention periods
 * in particular need sign-off from counsel.
 */
export const LEGAL_TOKENS = {
  /** Data controller of record and the party that content licences run to. */
  entity: 'the Organisation of Eastern Caribbean States Commission',
  /** Short form, for use mid-sentence where the full name reads badly. */
  entityShort: 'the OECS Commission',
  address: 'OECS Commission, Morne Fortune, P.O. Box 179, Castries, Saint Lucia',
  privacyEmail: 'privacy@oecsinnovation.org',
  legalEmail: 'legal@oecsinnovation.org',
  copyrightEmail: 'copyright@oecsinnovation.org',
  supportEmail: 'support@oecsinnovation.org',
  /** Data-protection contact. A named office, not a person, so it survives staff turnover. */
  dpo: 'the Data Protection Office, OECS Commission',
  /** Designated agent for copyright notices. Required for the takedown policy to be credible. */
  copyrightAgent: 'the Copyright Agent, OECS Commission Legal Unit',
  jurisdiction: 'Saint Lucia',
  platformDomain: 'oecsinnovation.org',
  /** Minimum age for an account, mirroring MINIMUM_SIGNUP_AGE in src/lib/validation.ts. */
  minimumAge: '13',
  /** Notice period for material changes, promised by Terms §16 and Privacy §12. */
  noticePeriod: '14 days',
  /** Response deadline for a data-rights request. */
  rightsResponsePeriod: '30 days',
  analyticsRetention: '24 months',
  caseRetention: '5 years',
  /** Actioned-and-unreversed copyright notices before an account is terminated. */
  strikeLimit: 'three',
} as const

export type LegalToken = keyof typeof LEGAL_TOKENS

/**
 * Anchored on word characters between percent signs. A lone `%` — "100% of
 * applications" — cannot match, because the pattern needs a closing one and a
 * name in between.
 */
const TOKEN_PATTERN = /%(\w+)%/g

/**
 * Substitutes `%token%` into a resolved string.
 *
 * Whitelist-only: an unknown token is left exactly as written rather than
 * replaced with `undefined`, so a typo shows up as literal `%entty%` on the page
 * during review instead of silently deleting a clause's subject. The content
 * test fails on it either way.
 */
export function fillTokens(text: string): string {
  return text.replace(TOKEN_PATTERN, (whole, name: string) =>
    name in LEGAL_TOKENS ? LEGAL_TOKENS[name as LegalToken] : whole
  )
}

/** Every `%token%` appearing in a string, for the content and i18n tests. */
export function extractTokens(text: string): string[] {
  return Array.from(text.matchAll(TOKEN_PATTERN), (m) => m[1])
}
