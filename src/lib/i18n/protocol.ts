/**
 * The wire contract between the browser batcher and /api/translate.
 *
 * Kept in src/lib/ rather than api/ so both sides import the same declarations —
 * the same arrangement api/ai-search.ts already uses for src/lib/site-map.ts.
 */

import type { TextFormat } from './hash'

export type { TextFormat }

/** The languages the app translates INTO. English is the source, never a target. */
export const TARGET_LANGS = ['fr', 'es'] as const
export type TargetLang = (typeof TARGET_LANGS)[number]

/** Every language the UI can be displayed in, including the source. */
export const UI_LANGS = ['en', 'fr', 'es'] as const
export type UiLang = (typeof UI_LANGS)[number]

export function isTargetLang(value: unknown): value is TargetLang {
  return typeof value === 'string' && (TARGET_LANGS as readonly string[]).includes(value)
}

export function isUiLang(value: unknown): value is UiLang {
  return typeof value === 'string' && (UI_LANGS as readonly string[]).includes(value)
}

/**
 * One string to translate.
 *
 * `i` is a caller-chosen index, and correlation is by index rather than by hash
 * on purpose. If the two runtimes ever disagreed about normalisation — an NFC
 * edge case, a non-breaking space, a stray CRLF — a hash-keyed response would
 * silently fail to correlate and the string would render blank or stale. With an
 * index, that drift costs one wasted cache lookup and nothing else.
 *
 * The field names are one letter because a list of 200 cards sends 200 of these.
 */
export interface TranslateItem {
  i: number
  t: string
  f?: TextFormat
}

export interface TranslateRequest {
  to: TargetLang
  items: TranslateItem[]
  /**
   * Whether the result may enter the SHARED cache. Defaults to true.
   *
   * `false` is the private path — direct messages, and anything else whose text
   * must not outlive the request. It still translates; it just leaves no trace,
   * and it therefore costs provider characters every single time, which is the
   * correct trade for content nobody else is allowed to read.
   */
  store?: boolean
}

/** Why the server could not translate. The page is never broken by any of these. */
export type DegradedReason =
  | 'no_key'
  | 'over_budget'
  | 'rate_limited'
  | 'provider_error'
  | 'store_unavailable'

export interface TranslateResult {
  /** The translation, or the source text unchanged when anything at all failed. */
  t: string
  /** Source language as detected by the provider, when it reported one. */
  from?: string
  /** True when this came out of the shared cache, i.e. cost no provider characters. */
  cached: boolean
}

export interface TranslateResponse {
  to: TargetLang
  /**
   * Keyed by the stringified request index.
   *
   * THE CONTRACT: there is an entry here for every index the caller sent, on
   * every code path, including total failure. A hole in this map is a hole in
   * the rendered page, so the handler fills it with source text up front and
   * only ever overwrites.
   */
  results: Record<string, TranslateResult>
  degraded?: DegradedReason
  /** Seconds. Present when the client should stop asking for a while. */
  retryAfter?: number
}
