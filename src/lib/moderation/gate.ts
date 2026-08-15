import { supabase } from '../supabase'
import type { ModerationSurface, Severity } from './types'

/**
 * Client half of the pre-publication model check.
 *
 * Fails open for the same reasons the route does, plus one that is specific to
 * here: a member on a Caribbean mobile link loses the connection mid-submit
 * often enough that "the network hiccuped, so you cannot publish" would be a
 * daily occurrence rather than an edge case.
 */

export interface GateVerdict {
  severity: Severity | null
  decision: 'allow' | 'warn' | 'block'
  reason: string | null
  fields: Record<string, { severity: Severity | null; reason: string | null }>
  degraded?: string
}

const ALLOW: GateVerdict = {
  severity: null,
  decision: 'allow',
  reason: null,
  fields: {},
}

/** Above the server's 6s, so its own graceful degradation wins where it can. */
const CLIENT_TIMEOUT_MS = 8_000
/** Only worth a model call past this much text. A three-word title is not. */
export const AI_MIN_CHARS = 200

const MEMO_LIMIT = 20
const memo = new Map<string, GateVerdict>()

export interface GateRequest {
  surface: ModerationSurface
  fields: Array<{ name: string; text: string }>
  locale?: string
  signal?: AbortSignal
}

export async function runModerationGate(params: GateRequest): Promise<GateVerdict> {
  const usable = params.fields.filter((f) => f.text.trim().length > 0)
  if (usable.length === 0) return ALLOW

  const total = usable.reduce((sum, f) => sum + f.text.length, 0)
  if (total < AI_MIN_CHARS) return ALLOW

  // Pressing submit again after fixing an unrelated field must not cost a
  // second call.
  const key = `${params.surface}|${JSON.stringify(usable)}`
  const cached = memo.get(key)
  if (cached) return cached

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ...ALLOW, degraded: 'no_session' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  params.signal?.addEventListener('abort', () => controller.abort())

  try {
    const res = await fetch('/api/moderate-check', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        surface: params.surface,
        fields: usable,
        locale: params.locale ?? 'en',
      }),
    })

    if (!res.ok) return { ...ALLOW, degraded: `http_${res.status}` }

    const verdict = (await res.json()) as GateVerdict
    if (!verdict || typeof verdict.decision !== 'string') {
      return { ...ALLOW, degraded: 'malformed' }
    }

    if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string)
    memo.set(key, verdict)
    return verdict
  } catch {
    return { ...ALLOW, degraded: 'network' }
  } finally {
    clearTimeout(timeout)
  }
}

/** Test seam. */
export function __clearGateMemo(): void {
  memo.clear()
}
