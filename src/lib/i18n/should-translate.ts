/**
 * "Is this string human copy, or is it a token that happens to be a string?"
 *
 * One predicate, four consumers, deliberately:
 *   - the extraction scanner (scripts/i18n/), so a slug never enters a catalog;
 *   - useTranslated(), so a URL never causes a network round trip;
 *   - the batcher, so it never occupies a slot in a batch;
 *   - api/translate.ts, which re-checks EVERYTHING server-side. That last one is
 *     not redundancy — it is the only thing standing between a hostile client and
 *     the shared monthly character budget.
 *
 * The bias is deliberate: false negatives (a real sentence left in English) are
 * visible and reportable; false positives (a UUID sent to a translation API) are
 * invisible, cost money, and can render corrupted identifiers into the page.
 */

import type { TextFormat } from './hash'

const URLISH = /^(https?:\/\/|www\.|mailto:|tel:|\/|#\/)/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** kebab-case, snake_case, dotted.paths — route slugs, permission keys, i18n ids */
const SLUG = /^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/
const HANDLE = /^[@#][\w.-]+$/
/** No letter in any script at all: pure numbers, punctuation, emoji. */
const NO_LETTER = /^[^\p{L}]+$/u
const NUMERICY = /^[\s\d.,:;+\-/()%$£×x]+$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/
const HEX = /^#?[0-9a-fA-F]{3,8}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FENCED = /^\s*```/
/** A single unbroken token… */
const ONE_TOKEN = /^\S+$/

/**
 * A Tailwind utility class.
 *
 * These reach the predicate because they are stored as object values under keys
 * the copy allowlist accepts — `{ text: 'text-[9px]' }` in a size table is
 * indistinguishable from `{ text: 'Save changes' }` by key alone. The codemod
 * duly wrapped two of them in `msg`, which is an invisible styling bug: the
 * class silently stops being applied and nothing errors.
 *
 * Matches the arbitrary-value form (`text-[9px]`, `w-[calc(100%-1rem)]`) and
 * the common numeric-scale utilities. Deliberately not "any hyphenated
 * lowercase word" — that is SLUG's job, and widening it here would swallow real
 * copy like "e-mail".
 */
const TAILWIND_CLASS = /^-?[a-z]+(?:-[a-z0-9.]+)*-\[[^\]]+\]$/

/**
 * A bare unit suffix rendered next to a number: `{executionTime}ms`.
 *
 * Two or three letters, and the same in French and Spanish — SI symbols are not
 * translated. Listed explicitly rather than matched by shape, because "in" and
 * "at" are also short lowercase words that ARE copy elsewhere.
 */
const UNITS = new Set(['ms', 'px', 'em', 'rem', 'kb', 'mb', 'gb', 'tb', 'kg', 'km', 'cm', 'mm'])
/** …that carries code punctuation. Both must hold — "Solar" is one token too. */
const CODE_PUNCT = /[{}<>|;=]|::|=>/

/**
 * Above this, a string stops being an incidental cost and becomes a deliberate
 * one. A whole document body belongs behind an explicit "Translate this page"
 * affordance, not behind a card scrolling into view. Mirrored by the
 * `length(source_text) <= 20000` CHECK on the translations table.
 */
export const MAX_TRANSLATABLE = 20_000

/**
 * Names machine translation reliably mangles.
 *
 * Deliberately small, and deliberately a patch rather than a strategy — the real
 * answer for a bad translation is the admin override screen. In HTML mode these
 * double as the set wrapped in <span translate="no"> before the text is sent,
 * which Azure honours natively.
 */
export const PROPER_NOUNS: ReadonlySet<string> = new Set([
  'KTIP',
  'KTiP',
  'OECS',
  'OECS KTIP',
  'Virtual Campus',
  'OECS Virtual Campus',
  'Supabase',
  'GitHub',
  'LinkedIn',
])

export function shouldTranslate(text: string | null | undefined, format: TextFormat = 'text'): boolean {
  if (!text) return false
  const s = text.trim()

  // "OK" and "No" are real copy and must survive, so the floor is 2, not 3.
  if (s.length < 2) return false
  if (s.length > MAX_TRANSLATABLE) return false

  if (NO_LETTER.test(s) || NUMERICY.test(s)) return false
  if (URLISH.test(s) || EMAIL.test(s) || HANDLE.test(s)) return false
  if (ISO_DATE.test(s) || HEX.test(s) || UUID.test(s)) return false
  if (PROPER_NOUNS.has(s)) return false
  if (UNITS.has(s.toLowerCase())) return false
  if (TAILWIND_CLASS.test(s)) return false

  // The token-shaped rules apply to plain text only. Real HTML is never a bare
  // slug, and its angle brackets would trip CODE_PUNCT on every single field.
  if (format === 'text') {
    if (SLUG.test(s)) return false
    if (FENCED.test(s)) return false
    if (ONE_TOKEN.test(s) && CODE_PUNCT.test(s)) return false
  }

  return true
}
