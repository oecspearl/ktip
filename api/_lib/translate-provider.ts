/**
 * The machine-translation provider, and the only file that knows which one it is.
 *
 * Everything upstream — api/translate.ts, the cache table, the client — deals in
 * `TranslateProvider`. Swapping Azure for DeepL, LibreTranslate or an LLM is a
 * new object in this file plus a value in the `provider` column; nothing else
 * changes. That indirection is deliberate: the free tier chosen today is a
 * commercial decision, not an architectural one.
 */

export type TextFormat = 'text' | 'html'

export interface TranslatedItem {
  text: string
  /** What the provider detected the source to be, when it says. */
  detected?: string
}

export interface TranslateProvider {
  /** Recorded in translations.provider so a bad batch can be traced to its source. */
  readonly id: string
  /** Hard ceilings for one call, so the caller can chunk correctly. */
  readonly maxItemsPerCall: number
  readonly maxCharsPerCall: number
  translate(
    texts: string[],
    to: string,
    format: TextFormat,
    signal: AbortSignal
  ): Promise<TranslatedItem[]>
}

/**
 * Thrown when the provider asks us to back off. `retryAfter` is passed all the
 * way to the browser so the batcher can stop hammering rather than guessing.
 */
export class ProviderRateLimited extends Error {
  readonly retryAfter: number
  constructor(retryAfter: number) {
    super(`Translation provider rate limited; retry after ${retryAfter}s`)
    this.name = 'ProviderRateLimited'
    this.retryAfter = retryAfter
  }
}

const AZURE_DEFAULT_ENDPOINT = 'https://api.cognitive.microsofttranslator.com'

/**
 * Azure AI Translator, REST API v3.0.
 *
 * The F0 tier is 2,000,000 characters a month at no cost and does not expire,
 * which is why it was chosen. Note that `textType` is a REQUEST-level parameter,
 * not a per-item one — so plain text and HTML have to be sent as separate calls.
 * The caller handles that; this function just takes whichever it was given.
 */
function azureProvider(key: string, region: string, endpoint: string): TranslateProvider {
  return {
    id: 'azure',
    // Documented service limits: 100 array elements and 50,000 characters per
    // request. The character figure counts the JSON envelope too, so the caller
    // chunks at 45,000 to leave headroom rather than discovering the edge in
    // production.
    maxItemsPerCall: 100,
    maxCharsPerCall: 50_000,

    async translate(texts, to, format, signal) {
      const url =
        `${endpoint.replace(/\/+$/, '')}/translate` +
        `?api-version=3.0&to=${encodeURIComponent(to)}&textType=${format}`

      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': key,
          // Required for a regional (non-global) resource. Sending it for a
          // global one is harmless, so it is always sent rather than guessed at.
          'Ocp-Apim-Subscription-Region': region,
        },
        body: JSON.stringify(texts.map((Text) => ({ Text }))),
      })

      if (res.status === 429 || res.status === 503) {
        const header = Number(res.headers.get('retry-after'))
        throw new ProviderRateLimited(Number.isFinite(header) && header > 0 ? header : 60)
      }

      if (!res.ok) {
        // The body carries Azure's own error code, which is the difference
        // between "wrong region" and "quota exhausted" when this shows up in
        // Sentry at 2am. Truncated because it is attacker-influenced text.
        const detail = await res.text().catch(() => '')
        throw new Error(`Azure Translator ${res.status}: ${detail.slice(0, 300)}`)
      }

      const body: unknown = await res.json()
      if (!Array.isArray(body)) throw new Error('Azure Translator returned a non-array body')

      // Positional: Azure answers in request order. The caller pairs by index, so
      // a short or ragged response must yield undefined rather than a shifted
      // result — silently misaligned translations are far worse than missing ones.
      return texts.map((_, i) => {
        const row = body[i] as
          | { translations?: { text?: string }[]; detectedLanguage?: { language?: string } }
          | undefined
        const text = row?.translations?.[0]?.text
        if (typeof text !== 'string') return { text: texts[i] }
        return { text, detected: row?.detectedLanguage?.language }
      })
    },
  }
}

/**
 * The configured provider, or `null` when there is no key.
 *
 * `null` is a supported state, not an error: without a key the site still runs,
 * the static catalogs still switch the chrome to French, and user-generated
 * content simply stays in the language it was written in. api/translate.ts turns
 * that into `degraded: 'no_key'` on a 200 rather than a 503, because a reader
 * must never see a broken page over a missing environment variable.
 */
export function getProvider(): TranslateProvider | null {
  const which = (process.env.TRANSLATION_PROVIDER || 'azure').toLowerCase()

  if (which === 'azure') {
    const key = process.env.AZURE_TRANSLATOR_KEY
    if (!key) return null
    return azureProvider(
      key,
      process.env.AZURE_TRANSLATOR_REGION || 'global',
      process.env.AZURE_TRANSLATOR_ENDPOINT || AZURE_DEFAULT_ENDPOINT
    )
  }

  if (which === 'none') return null

  // An unrecognised value is a typo in a deployment variable. Degrading to
  // English is right; doing it silently is not, so it is at least logged once
  // per cold start rather than per request.
  console.warn(`[translate] Unknown TRANSLATION_PROVIDER "${which}" — translation disabled`)
  return null
}
