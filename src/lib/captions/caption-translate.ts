import { isUiLang, type UiLang } from '../i18n/protocol'

/**
 * Translate one caption piece into the languages its listeners read, through
 * api/captions/translate.ts: one request, one provider call, nothing cached.
 *
 * Resolves with whatever languages came back, possibly none. Never rejects:
 * the original is already on every screen, so a failure costs nothing but the
 * translation.
 */

const ENDPOINT = '/api/captions/translate'
const TIMEOUT_MS = 8_000

/** Set when the server says the budget or the provider is out; nothing is sent until then. */
let backoffUntil = 0

export interface CaptionTranslateRequest {
  text: string
  from: UiLang
  /** Only the languages someone in the call reads (captions/followers.ts). */
  targets: UiLang[]
  /** The speaker's previous piece, when it was recent. Helps a split sentence read as one. */
  context?: string
  /** The LiveKit room name, for the organiser's usage ledger. */
  roomId?: string
}

/**
 * The member's token, so the server can bill the room's usage ledger. Imported
 * lazily: the Supabase client throws at module load without its env.
 */
async function accessToken(): Promise<string | null> {
  try {
    const { supabase } = await import('../supabase')
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

export function readVariants(raw: unknown, from: UiLang): Partial<Record<UiLang, string>> {
  const out: Partial<Record<UiLang, string>> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [lang, text] of Object.entries(raw as Record<string, unknown>)) {
    if (isUiLang(lang) && lang !== from && typeof text === 'string' && text.trim()) out[lang] = text.trim()
  }
  return out
}

export async function translateCaption(
  request: CaptionTranslateRequest
): Promise<Partial<Record<UiLang, string>>> {
  if (Date.now() < backoffUntil || request.targets.length === 0) return {}
  const token = await accessToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
    })
    if (!res.ok) return {}
    const body = (await res.json()) as { variants?: unknown; degraded?: unknown; retryAfter?: unknown }
    if (body.degraded === 'rate_limited' || body.degraded === 'over_budget') {
      const seconds = typeof body.retryAfter === 'number' && body.retryAfter > 0 ? body.retryAfter : 30
      backoffUntil = Date.now() + seconds * 1000
    }
    return readVariants(body.variants, request.from)
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}
