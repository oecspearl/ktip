import { createClient } from '@supabase/supabase-js'
import { getProvider } from './_lib/translate-provider'
import { contentHash } from '../src/lib/i18n/hash'
import { isTargetLang } from '../src/lib/i18n/protocol'
import {
  MAX_ITEMS,
  MAX_REQUEST_CHARS,
  translateBatch,
  type BudgetClaim,
  type CachedRow,
  type NewRow,
  type TranslationStore,
} from '../src/lib/i18n/translate-core'
import type { TargetLang, TranslateItem } from '../src/lib/i18n/protocol'
import type { TextFormat } from '../src/lib/i18n/hash'

export const config = { runtime: 'edge' }

/**
 * Machine translation for member-written content.
 *
 * Three deliberate departures from the shape api/ai-chat.ts established:
 *
 * 1. **No 5xx for a configuration or provider problem.** ai-chat.ts answers 503
 *    when its key is missing and the UI renders an "unavailable" panel. Here the
 *    failure has to be INVISIBLE — the reader already has legible English on
 *    screen. A non-2xx would make the batcher treat it as an error and retry
 *    while nothing improves, so the contract is `degraded` inside a 200. The
 *    only non-2xx are 400 (malformed), 405 and 413 (oversized).
 *
 * 2. **12s abort, not 30s.** A translation is a progressive enhancement over
 *    text that is already rendered. Holding the request for half a minute to
 *    improve wording nobody is waiting on is the wrong trade.
 *
 * 3. **It is rate limited.** ai-chat.ts is behind auth-gated UI; this route is
 *    reachable anonymously from public pages and spends a budget shared by every
 *    reader of the site.
 */

const PROVIDER_TIMEOUT_MS = 12_000

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

/**
 * The Supabase-backed store. Uses the secret key, because migration 097 gives
 * `translations` no policy for anon or authenticated at all: the table holds text
 * copied out of rows that RLS protects, so this handler is the only door.
 */
function makeStore(ipHash: string, cap: number, authenticated: boolean): TranslationStore | null {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const db = createClient(url, key, { auth: { persistSession: false } })

  return {
    async lookup(hashes: string[], lang: TargetLang, format: TextFormat): Promise<CachedRow[]> {
      const { data, error } = await db
        .from('translations')
        .select('hash,translated_text,source_lang')
        .eq('target_lang', lang)
        .eq('format', format)
        .in('hash', hashes)
      if (error) throw error
      return (data ?? []) as CachedRow[]
    },

    async save(rows: NewRow[]) {
      // ignoreDuplicates, i.e. ON CONFLICT DO NOTHING, NOT an update. Two readers
      // racing on the same brand-new string both translate and both write; the
      // loser must be a no-op. Above all it must not overwrite an admin override
      // that landed between this request's lookup and this write.
      const { error } = await db
        .from('translations')
        .upsert(rows, { onConflict: 'hash,target_lang,format', ignoreDuplicates: true })
      if (error) throw error
    },

    async claimBudget(chars: number): Promise<BudgetClaim> {
      const { data, error } = await db.rpc('claim_translation_budget', {
        p_ip_hash: ipHash,
        p_chars: chars,
        p_cap: cap,
        p_authenticated: authenticated,
      })
      if (error) throw error
      return (data ?? { allowed: false, reason: 'over_budget' }) as BudgetClaim
    },

    async touch(hashes: string[], lang: TargetLang, hits: number, misses: number) {
      await db.rpc('touch_translations', {
        p_hashes: hashes,
        p_lang: lang,
        p_hits: hits,
        p_misses: misses,
      })
    },

    async prune() {
      await db.rpc('prune_translations', {})
    },
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { to?: unknown; items?: unknown; store?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!isTargetLang(body.to)) return json({ error: 'to must be one of: fr, es' }, 400)
  const to: TargetLang = body.to

  if (!Array.isArray(body.items)) return json({ error: 'items must be an array' }, 400)
  if (body.items.length === 0) return json({ to, results: {} })
  if (body.items.length > MAX_ITEMS) return json({ error: 'too many items' }, 413)

  const items: TranslateItem[] = []
  let totalChars = 0
  for (const raw of body.items as unknown[]) {
    const entry = raw as { i?: unknown; t?: unknown; f?: unknown }
    if (typeof entry?.i !== 'number' || !Number.isFinite(entry.i)) {
      return json({ error: 'each item needs a numeric index i' }, 400)
    }
    const text = typeof entry.t === 'string' ? entry.t : ''
    totalChars += text.length
    if (totalChars > MAX_REQUEST_CHARS) return json({ error: 'payload too large' }, 413)
    items.push({ i: entry.i, t: text, f: entry.f === 'html' ? 'html' : 'text' })
  }

  // Salted before storage: translation_rate_limit would otherwise be an access
  // log of every reader of every page. The salt being unset is survivable (the
  // hash is still one-way) but is called out in .env.example.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipHash = await contentHash(`${process.env.TRANSLATION_IP_SALT ?? ''}${ip}`, 'text')

  const cap = Number(process.env.TRANSLATION_MONTHLY_CHAR_CAP ?? 1_800_000)
  // Presence of a bearer token, not its validity. This only picks which throttle
  // ceiling applies; nothing here is gated on identity, and a forged header buys
  // the caller a larger rate-limit bucket and nothing else.
  const authenticated = Boolean(request.headers.get('authorization'))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const response = await translateBatch(to, items, body.store !== false, {
      provider: getProvider(),
      store: makeStore(ipHash, Number.isFinite(cap) ? cap : 1_800_000, authenticated),
      signal: controller.signal,
    })

    // Explicitly uncacheable. The sharing happens in Postgres, where it is keyed
    // by content and governed by RLS; an HTTP cache here would be keyed by URL
    // alone and would happily hold a `store: false` response — the private path,
    // used for direct messages. That is the exact shape of the service-worker
    // bug documented at length in vite.config.ts, and it is not worth repeating
    // to save a round trip the client already avoids with its own two tiers.
    return json(response, 200, { 'Cache-Control': 'no-store' })
  } catch (err) {
    // translateBatch is written not to throw. If it does, that is a bug — but a
    // reader must still not see a broken page, so answer with the source text.
    console.error('[translate] unexpected failure', err)
    const results: Record<string, { t: string; cached: boolean }> = {}
    for (const item of items) results[String(item.i)] = { t: item.t, cached: false }
    return json({ to, results, degraded: 'provider_error' }, 200, { 'Cache-Control': 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}
