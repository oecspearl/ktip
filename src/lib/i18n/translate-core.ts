/**
 * Everything /api/translate does, minus the plumbing.
 *
 * The handler in api/translate.ts is a thin adapter: it builds a Supabase client,
 * reads env, and calls translateBatch(). All the decisions live here, with their
 * dependencies injected, so they are covered by the existing vitest `include`
 * without a config change and without a live database or a provider key.
 */

import { contentHash, normalize } from './hash'
import { shouldTranslate } from './should-translate'
import type { TextFormat } from './hash'
import type {
  DegradedReason,
  TargetLang,
  TranslateItem,
  TranslateResponse,
  TranslateResult,
} from './protocol'

/** Matches api/_lib/translate-provider.ts, restated so this file stays edge-free. */
export interface Provider {
  readonly id: string
  readonly maxItemsPerCall: number
  readonly maxCharsPerCall: number
  translate(
    texts: string[],
    to: string,
    format: TextFormat,
    signal: AbortSignal
  ): Promise<{ text: string; detected?: string }[]>
}

export interface CachedRow {
  hash: string
  translated_text: string
  source_lang?: string | null
}

export interface NewRow {
  hash: string
  target_lang: string
  format: TextFormat
  source_lang: string | null
  source_text: string
  translated_text: string
  provider: string
  char_count: number
}

export interface BudgetClaim {
  allowed: boolean
  reason?: 'over_budget' | 'rate_limited'
  retry_after?: number
}

/**
 * The database, narrowed to the four things this needs. A narrow port rather
 * than a Supabase client so the tests can assert on call counts — "a fully
 * cached batch made ZERO budget claims and ZERO provider calls" is the single
 * most important property in this file, and it is only checkable at this seam.
 */
export interface TranslationStore {
  lookup(hashes: string[], lang: TargetLang, format: TextFormat): Promise<CachedRow[]>
  save(rows: NewRow[]): Promise<void>
  claimBudget(chars: number): Promise<BudgetClaim>
  touch(hashes: string[], lang: TargetLang, hits: number, misses: number): Promise<void>
  prune(): Promise<void>
}

export interface TranslateDeps {
  /** null when no key is configured — a supported state, not an error. */
  provider: Provider | null
  /** null when Supabase is unreachable; translation then runs uncached. */
  store: TranslationStore | null
  signal: AbortSignal
  /** Injected so the housekeeping sample is deterministic under test. */
  random?: () => number
}

/** Guard rails on one request. Beyond these the caller gets a 413 from the handler. */
export const MAX_ITEMS = 200
export const MAX_REQUEST_CHARS = 100_000

/** Rate at which a request also runs the opportunistic eviction sweep. */
const PRUNE_SAMPLE = 0.002

interface Unit {
  i: number
  text: string
  format: TextFormat
  hash: string
}

/**
 * Translate a batch, cache-first.
 *
 * Never throws for an operational failure. Every exit returns a full `results`
 * map — source text where nothing better was available — because the alternative
 * is a page with holes in it, and the English the reader already has on screen is
 * always better than that.
 */
export async function translateBatch(
  to: TargetLang,
  items: TranslateItem[],
  store: boolean,
  deps: TranslateDeps
): Promise<TranslateResponse> {
  const results: Record<string, TranslateResult> = {}
  // Fill with the source FIRST. Everything below only ever overwrites, so no
  // later failure can leave an index unanswered.
  for (const item of items) results[String(item.i)] = { t: item.t, cached: false }

  const degrade = (reason: DegradedReason, retryAfter?: number): TranslateResponse => ({
    to,
    results,
    degraded: reason,
    ...(retryAfter ? { retryAfter } : {}),
  })

  // ---- normalise and re-apply the skip predicate --------------------------
  // Re-checked here rather than trusted from the client: this is the only thing
  // standing between a hostile caller and the shared monthly character budget.
  const work: Unit[] = []
  for (const item of items) {
    const format: TextFormat = item.f === 'html' ? 'html' : 'text'
    const text = normalize(String(item.t ?? ''), format)
    if (!shouldTranslate(text, format)) continue
    work.push({ i: item.i, text, format, hash: await contentHash(text, format) })
  }
  if (work.length === 0) return { to, results }

  // Without a store there is no cache and no budget ledger. Rather than translate
  // uncapped against a shared quota, decline — the reader keeps the English they
  // already have, and the outage does not turn into a bill.
  if (!deps.store) return degrade('store_unavailable')
  const db = deps.store

  // ---- cache lookup, one query per format present -------------------------
  const cached = new Map<string, CachedRow>()
  for (const format of ['text', 'html'] as const) {
    const hashes = [...new Set(work.filter((w) => w.format === format).map((w) => w.hash))]
    if (hashes.length === 0) continue
    try {
      for (const row of await db.lookup(hashes, to, format)) {
        cached.set(`${format}:${row.hash}`, row)
      }
    } catch {
      // A failed lookup is a miss, not a failure. Worst case the batch costs
      // provider characters it did not have to.
    }
  }

  // Misses are deduplicated by content, and each carries every index that asked
  // for it. Two cards showing the same tag, or a title repeated in a list and in
  // its own detail panel, must cost the provider once — the client batcher
  // already dedupes, but it is not the thing being billed.
  const missByKey = new Map<string, { unit: Unit; indices: number[] }>()
  const hitHashes: string[] = []
  for (const unit of work) {
    const key = `${unit.format}:${unit.hash}`
    const row = cached.get(key)
    if (row) {
      results[String(unit.i)] = {
        t: row.translated_text,
        cached: true,
        ...(row.source_lang ? { from: row.source_lang } : {}),
      }
      hitHashes.push(unit.hash)
      continue
    }
    const existing = missByKey.get(key)
    if (existing) existing.indices.push(unit.i)
    else missByKey.set(key, { unit, indices: [unit.i] })
  }
  const misses = [...missByKey.values()]

  // Bookkeeping is best-effort in both senses: it must not fail the request, and
  // it must not be awaited in a way that adds latency to the common path.
  const record = async (hits: number, missed: number) => {
    try {
      await db.touch([...new Set(hitHashes)], to, hits, missed)
    } catch {
      /* metering is not worth failing a page render over */
    }
  }

  if (misses.length === 0) {
    await record(hitHashes.length, 0)
    return { to, results }
  }

  const provider = deps.provider
  if (!provider) {
    await record(hitHashes.length, misses.length)
    return degrade('no_key')
  }

  // ---- budget ------------------------------------------------------------
  // Only misses are charged. Cache hits stay free forever, which is precisely
  // what keeps the site translated after the monthly cap is gone.
  const missChars = misses.reduce((n, m) => n + m.unit.text.length, 0)
  let claim: BudgetClaim
  try {
    claim = await db.claimBudget(missChars)
  } catch {
    await record(hitHashes.length, misses.length)
    return degrade('provider_error')
  }
  if (!claim.allowed) {
    await record(hitHashes.length, misses.length)
    return degrade(claim.reason === 'rate_limited' ? 'rate_limited' : 'over_budget', claim.retry_after)
  }

  // ---- provider ----------------------------------------------------------
  // textType is a request-level parameter, so text and html cannot share a call.
  type Miss = (typeof misses)[number]
  const chunks: Miss[][] = []
  for (const format of ['text', 'html'] as const) {
    let current: Miss[] = []
    let chars = 0
    for (const miss of misses.filter((m) => m.unit.format === format)) {
      // 0.9 of the documented character limit, because that limit counts the
      // JSON envelope too — discovering the real edge in production means a 400
      // for a whole page's worth of text.
      const wouldOverflow =
        current.length >= provider.maxItemsPerCall ||
        chars + miss.unit.text.length > provider.maxCharsPerCall * 0.9
      if (wouldOverflow && current.length > 0) {
        chunks.push(current)
        current = []
        chars = 0
      }
      current.push(miss)
      chars += miss.unit.text.length
    }
    if (current.length > 0) chunks.push(current)
  }

  const rows: NewRow[] = []
  try {
    for (const chunk of chunks) {
      const out = await provider.translate(
        chunk.map((c) => c.unit.text),
        to,
        chunk[0].unit.format,
        deps.signal
      )
      chunk.forEach(({ unit, indices }, n) => {
        const answer = out[n]
        if (!answer) return
        // The provider says this was already in the target language. Keeping the
        // source beats a pointless round trip through itself, which is how you
        // get French quietly re-worded into worse French.
        const text = answer.detected === to ? unit.text : answer.text
        const result: TranslateResult = {
          t: text,
          cached: false,
          ...(answer.detected ? { from: answer.detected } : {}),
        }
        for (const i of indices) results[String(i)] = result
        if (store) {
          rows.push({
            hash: unit.hash,
            target_lang: to,
            format: unit.format,
            source_lang: answer.detected ?? null,
            source_text: unit.text,
            translated_text: text,
            provider: provider.id,
            char_count: unit.text.length,
          })
        }
      })
    }
  } catch (err) {
    await record(hitHashes.length, misses.length)
    const retryAfter = (err as { retryAfter?: number })?.retryAfter
    return degrade(retryAfter ? 'rate_limited' : 'provider_error', retryAfter)
  }

  if (rows.length > 0) {
    try {
      await db.save(rows)
    } catch {
      // The reader still gets their translation; it just costs the next reader
      // another call. Not worth degrading the response over.
    }
  }

  await record(hitHashes.length, misses.length)

  // No pg_cron on this project, so eviction rides along on a small fraction of
  // requests — the same pattern migrations 056, 068 and 091 use.
  const random = deps.random ?? Math.random
  if (random() < PRUNE_SAMPLE) {
    try {
      await db.prune()
    } catch {
      /* housekeeping */
    }
  }

  return { to, results }
}
