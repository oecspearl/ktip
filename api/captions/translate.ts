import { getProvider, ProviderRateLimited, type TranslateProvider } from '../_lib/translate-provider'
import { clientIp } from '../_lib/client-ip'
import {
  afterResponse,
  recordTranslationUsage,
  serviceClient,
  type EdgeContext,
} from '../_lib/venue-usage'
import { contentHash } from '../../src/lib/i18n/hash'
import { UI_LANGS, isUiLang } from '../../src/lib/i18n/protocol'
import { shouldTranslate } from '../../src/lib/i18n/should-translate'

export const config = { runtime: 'edge' }

/**
 * One fragment of live speech into every other language, as fast as possible.
 *
 * Captions used /api/translate, once per language. That path is built for page
 * text: a cache lookup, a budget claim and a bookkeeping write, one after the
 * other, around the provider call, and a separate request for French and for
 * Spanish. Spoken words are never cached (migration 097), so for captions all
 * of that was waiting on nothing. Here:
 *
 *   - one provider call answers every language at once
 *   - the only thing before it is the budget claim, the same per-address
 *     throttle and monthly cap /api/translate applies. It stays in front on
 *     purpose: a throttled caller must not be able to keep spending the free
 *     tier's daily requests
 *   - the usage ledger is written after the answer has gone
 *   - the previous fragment rides along as context, so a sentence cut in two
 *     still translates as one
 *
 * Request: { text, from: en|fr|es, context?, roomId? }. Answers 200
 * { variants: { fr?: '…', es?: '…' }, degraded?, retryAfter? }; like
 * /api/translate, a provider or budget problem is `degraded` inside a 200,
 * because the speaker's original is already on everyone's screen.
 */

const TIMEOUT_MS = 6_000
const MAX_TEXT = 600
const MAX_CONTEXT = 300
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

/** One call when the provider can, otherwise one per language, in parallel. */
async function translateAll(
  provider: TranslateProvider,
  text: string,
  from: string,
  to: string[],
  context: string | undefined,
  signal: AbortSignal
): Promise<Partial<Record<string, string>>> {
  if (provider.translateCaption) return provider.translateCaption({ text, from, to, context }, signal)
  const pairs = await Promise.all(
    to.map(async (lang) => [lang, (await provider.translate([text], lang, 'text', signal))[0]?.text] as const)
  )
  return Object.fromEntries(pairs.filter(([, out]) => out && out !== text))
}

export default async function handler(request: Request, context?: EdgeContext): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { text?: unknown; from?: unknown; context?: unknown; roomId?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text || text.length > MAX_TEXT) return json({ error: 'text is missing or too long' }, 400)
  if (!isUiLang(body.from)) return json({ error: 'from must be one of: en, fr, es' }, 400)
  const from = body.from
  const previous =
    typeof body.context === 'string' && body.context.trim()
      ? body.context.trim().slice(-MAX_CONTEXT)
      : undefined
  const roomId = typeof body.roomId === 'string' && UUID.test(body.roomId) ? body.roomId : null

  const to = UI_LANGS.filter((lang) => lang !== from)
  if (!shouldTranslate(text)) return json({ variants: {} })

  const provider = getProvider()
  if (!provider) return json({ variants: {}, degraded: 'no_key' })
  const db = serviceClient()
  if (!db) return json({ variants: {}, degraded: 'store_unavailable' })

  const chars = text.length * to.length
  const ipHash = await contentHash(`${process.env.TRANSLATION_IP_SALT ?? ''}${clientIp(request)}`, 'text')
  const cap = Number(process.env.TRANSLATION_MONTHLY_CHAR_CAP ?? 1_800_000)
  const { data: claim, error: claimError } = await db.rpc('claim_translation_budget', {
    p_ip_hash: ipHash,
    p_chars: chars,
    p_cap: Number.isFinite(cap) ? cap : 1_800_000,
    p_authenticated: Boolean(request.headers.get('authorization')),
  })
  if (claimError) return json({ variants: {}, degraded: 'provider_error' })
  const verdict = (claim ?? { allowed: false, reason: 'over_budget' }) as {
    allowed: boolean
    reason?: string
    retry_after?: number
  }
  if (!verdict.allowed) {
    return json({
      variants: {},
      degraded: verdict.reason === 'rate_limited' ? 'rate_limited' : 'over_budget',
      ...(verdict.retry_after ? { retryAfter: verdict.retry_after } : {}),
    })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const variants = await translateAll(provider, text, from, [...to], previous, controller.signal)
    if (roomId) {
      afterResponse(
        context,
        recordTranslationUsage({
          authHeader: request.headers.get('authorization'),
          roomId,
          surface: 'captions',
          chars,
          to: to.join(','),
          provider: provider.id,
        })
      )
    }
    return json({ variants })
  } catch (err) {
    if (err instanceof ProviderRateLimited) {
      return json({ variants: {}, degraded: 'rate_limited', retryAfter: err.retryAfter })
    }
    console.error('[captions/translate] provider failed', String(err).slice(0, 300))
    return json({ variants: {}, degraded: 'provider_error' })
  } finally {
    clearTimeout(timer)
  }
}
