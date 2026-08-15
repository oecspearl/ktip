import { authenticate, adminClientOrNull } from './_lib/require-permission'
import { getModerationProvider, type ModerationSeverity } from './_lib/moderation-provider'

export const config = { runtime: 'edge' }

/**
 * Pre-publication second opinion on a member's own draft.
 *
 * Unlike api/moderate.ts, this one IS in the write path — but only for content
 * that is not realtime-published, which is why it can be. A project
 * description or a grant answer is submitted once, deliberately, and waiting a
 * second for an answer is acceptable; a chat message is not, and chat
 * deliberately does not call this.
 *
 * ── Failure mode: FAIL OPEN ──────────────────────────────────────────────
 * A timeout, a provider error, a missing key or an exhausted budget all return
 * {decision: 'allow', degraded: …} and the submit proceeds. Three reasons, in
 * order of weight:
 *
 *   1. The net is still there. scan_content() runs in a BEFORE INSERT trigger
 *      inside the same transaction as the write, so nothing bypasses
 *      moderation because this route was down — it bypasses the *second*
 *      opinion.
 *   2. Fail-closed converts a vendor outage into a platform outage. A bad hour
 *      at the provider would mean no member can publish a project or submit a
 *      grant application on deadline day. That is the larger incident.
 *   3. Fail-closed is weaponisable. Anyone who can make the provider slow —
 *      including by flooding it themselves — gets a publishing denial of
 *      service against everybody.
 *
 * The one thing never discarded: a returned `block` is honoured even when the
 * response was otherwise degraded, and a `high` verdict is always logged.
 */

const TIMEOUT_MS = 6_000
const MAX_FIELDS = 6
const MAX_CHARS = 8_000

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Decision = 'allow' | 'warn' | 'block'

const decisionFor = (severity: ModerationSeverity): Decision => {
  if (severity === 'medium' || severity === 'high') return 'block'
  if (severity === 'low') return 'warn'
  return 'allow'
}

const allow = (degraded: string) =>
  json({ severity: null, decision: 'allow', reason: null, fields: {}, degraded }, 200)

/**
 * Keeps the head and the tail. A draft's opening and its closing paragraph are
 * where a member puts the thing they are actually saying; the middle of a
 * 20,000-character proposal is budget tables.
 */
function truncate(text: string, budget: number): string {
  if (text.length <= budget) return text
  const head = Math.floor(budget * 0.6)
  const tail = budget - head
  return `${text.slice(0, head)}\n…\n${text.slice(-tail)}`
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Any signed-in member may ask whether their own draft is acceptable. There
  // is no meaningful deny state, so this is authentication, not authorisation.
  const guard = await authenticate(request)
  if (!guard.ok) return guard.response
  const { callerId } = guard

  let body: { surface?: string; fields?: Array<{ name: string; text: string }>; locale?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const surface = typeof body.surface === 'string' ? body.surface : 'unknown'
  const locale = typeof body.locale === 'string' ? body.locale : 'en'
  const incoming = Array.isArray(body.fields) ? body.fields.slice(0, MAX_FIELDS) : []

  const fields = incoming
    .filter((f) => f && typeof f.name === 'string' && typeof f.text === 'string')
    .map((f) => ({ name: f.name.slice(0, 64), text: f.text }))
    .filter((f) => f.text.trim().length > 0)

  if (fields.length === 0) return allow('empty')

  const totalChars = fields.reduce((sum, f) => sum + f.text.length, 0)
  if (totalChars > MAX_CHARS * 4) return json({ error: 'Payload too large' }, 413)

  const provider = getModerationProvider()
  if (!provider) return allow('no_key')

  const adminClient = adminClientOrNull()
  if (!adminClient) return allow('no_key')

  // Spend is claimed BEFORE the call, atomically, so two tabs cannot both pass
  // the check and both spend.
  const { data: claim } = await adminClient.rpc('claim_moderation_check_budget', {
    p_user: callerId,
    p_chars: Math.min(totalChars, MAX_CHARS),
    p_images: 0,
  })

  if (claim && (claim as any).allowed === false) {
    return allow((claim as any).reason === 'over_budget' ? 'over_budget' : 'rate_limited')
  }

  const perField = Math.max(500, Math.floor(MAX_CHARS / fields.length))
  const payload = fields.map((f) => ({ name: f.name, text: truncate(f.text, perField) }))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const verdict = await provider.classifyText(payload, locale, controller.signal)
    const decision = decisionFor(verdict.severity)

    const fieldMap: Record<string, { severity: string | null; reason: string | null }> = {}
    for (const f of verdict.fields) {
      fieldMap[f.name] = {
        severity: f.severity === 'none' ? null : f.severity,
        reason: f.reason,
      }
    }

    // Logged whatever the verdict, because this is the only place the safety
    // team can see who keeps trying to post things that get blocked — content
    // that never becomes a row leaves no other trace. `allow` is sampled so the
    // table does not become an activity log of every submit on the platform.
    const shouldLog = decision !== 'allow' || Math.floor(Number(new Date()) / 1000) % 20 === 0
    if (shouldLog) {
      await adminClient.from('moderation_log').insert({
        actor_kind: 'system',
        user_id: callerId,
        target_type: surface,
        target_id: null,
        severity: verdict.severity === 'none' ? null : verdict.severity,
        action: 'flagged',
        detail: {
          source: 'pre_submit_gate',
          decision,
          reason: verdict.reason,
          surface,
          chars: totalChars,
          provider: provider.id,
        },
      } as any)
    }

    return json(
      {
        severity: verdict.severity === 'none' ? null : verdict.severity,
        decision,
        reason: verdict.reason,
        fields: fieldMap,
      },
      200
    )
  } catch (err: any) {
    if (err?.name === 'ProviderRateLimited') return allow('rate_limited')
    return allow(err?.name === 'AbortError' ? 'timeout' : 'provider_error')
  } finally {
    clearTimeout(timeout)
  }
}
