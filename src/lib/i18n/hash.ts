/**
 * The single definition of "the same string".
 *
 * Imported by both the browser (for its localStorage tier) and the Edge runtime
 * (api/translate.ts, which is the only thing that ever writes to the shared
 * cache). Cross-importing from api/ into src/lib/ is an established pattern here
 * — api/ai-search.ts already imports src/lib/site-map.ts — and it matters that
 * there is exactly one copy of this logic: two definitions of "normalised" means
 * the cache silently misses and every visitor pays the provider again.
 *
 * Note that the *client never hashes*. The wire protocol correlates by integer
 * index (see api/translate.ts), and the server always recomputes the hash from
 * the text it received. This module is exported for the client's localStorage
 * key and for tests; a client that disagreed about normalisation would waste a
 * lookup, never poison an entry.
 */

export type TextFormat = 'text' | 'html'

/**
 * U+001F Unit Separator, between the format tag and the text, so that a source
 * string beginning with "html" cannot collide with an html-format entry. It is
 * built with fromCharCode rather than written literally: a raw control character
 * in source survives no round trip through an editor, a diff view, or a paste.
 */
const FIELD_SEP = String.fromCharCode(0x1f)

/**
 * Canonical form of a source string.
 *
 * Idempotent by construction — `normalize(normalize(x)) === normalize(x)` — which
 * is asserted in the tests, because a non-idempotent normaliser makes the cache
 * key depend on how many times the text has been round-tripped.
 */
export function normalize(text: string, format: TextFormat = 'text'): string {
  // NFC first: "é" typed on a Mac (NFD, e + combining acute) and "é" pasted from
  // Windows (NFC, single code point) are the same word and must be one cache row.
  let s = text.normalize('NFC').replace(/\r\n?/g, '\n')

  // Horizontal whitespace collapses in plain text only. In HTML it is significant
  // inside <pre>, and collapsing it would change the bytes sent to the provider
  // anyway — so the html path leaves the run untouched and only trims the ends.
  if (format === 'text') s = s.replace(/[ \t]+/g, ' ')

  return s.trim()
}

/**
 * Lowercase hex SHA-256 of `${format}${normalize(text, format)}`.
 *
 * WebCrypto, which is present in the Vercel Edge runtime and in every secure
 * browser context. The target language is deliberately NOT part of the hash — it
 * is a separate key column, so the admin override screen can show every language
 * for one source string in a single grouped query.
 */
export async function contentHash(text: string, format: TextFormat = 'text'): Promise<string> {
  const input = `${format}${FIELD_SEP}${normalize(text, format)}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Synchronous, non-cryptographic key for the browser's localStorage tier.
 *
 * crypto.subtle is async and cannot run on the render path, and it is `undefined`
 * altogether on a non-secure origin — which is exactly how the app is reached when
 * testing from a phone at http://192.168.x.x:5173. So the local tier uses FNV-1a
 * plus the length, and the stored record keeps the source text so a collision is
 * verified away on read. A collision costs a miss; it can never render the wrong
 * translation.
 */
export function localKey(text: string, format: TextFormat, lang: string): string {
  const s = normalize(text, format)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    // The 32-bit FNV prime (16777619) as shifts, kept in unsigned space. Math.imul
    // would do, but this makes the wraparound explicit rather than incidental.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return `${lang}:${format}:${h.toString(16)}:${s.length}`
}
