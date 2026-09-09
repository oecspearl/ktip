import { authenticate, adminClientOrNull } from './_lib/require-permission'
import { clientIp } from './_lib/client-ip'

export const config = { runtime: 'edge' }

/**
 * The conversational half of the KTIP Assistant, and the grant-writing helpers.
 *
 * Every caller is a signed-in member: the assistant lives inside the messaging
 * panel, which renders nothing for a guest, and the grant helpers sit inside an
 * application form. So this is authentication, not authorisation — there is no
 * meaningful deny state short of "not a member", and minting a permission key
 * for it would mean editing the matrix in four places to express a rule that
 * is always true. Same reasoning as api/moderate-check.ts.
 *
 * Before this guard existed the route was an open proxy onto OPENAI_API_KEY:
 * no token, no throttle, and a caller-supplied `messages` array forwarded
 * verbatim. Anyone who could reach the deployment could spend the key at will,
 * and the adversarial review of 2026-08-04 filed it as its first finding.
 *
 * Both limits are consumed BEFORE the body is parsed. A malformed request
 * still costs the caller an attempt, so a probe cannot burn the key lookup for
 * free — the same ordering api/partner/v1/employers.ts uses.
 */

const ALLOWED_MODELS = ['gpt-4o-mini']

/** A conversation turn, not a flood. Bursts of a few per minute are normal. */
const USER_LIMIT = 30
const USER_WINDOW = 900
/** The daily ceiling exists so a stuck retry loop cannot run all night. */
const USER_DAILY_LIMIT = 200
const USER_DAILY_WINDOW = 86_400

/**
 * The longest legitimate payload is review_application, which sends the whole
 * draft. A grant answer set is a few thousand words; this is a hard ceiling on
 * what one call may cost, not a target.
 */
const MAX_MESSAGES = 40
const MAX_TOTAL_CHARS = 32_000
const ALLOWED_ROLES = new Set(['system', 'user', 'assistant'])

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

type Message = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Only `role` and `content` reach the provider. A raw passthrough would let a
 * caller attach `name`, `tool_calls` or anything else the upstream schema
 * accepts, and every one of those is a surface this route never meant to offer.
 */
function sanitizeMessages(raw: unknown): Message[] | { error: string; status: number } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'messages array is required', status: 400 }
  }
  if (raw.length > MAX_MESSAGES) {
    return { error: `messages may hold at most ${MAX_MESSAGES} entries`, status: 413 }
  }

  const messages: Message[] = []
  let total = 0
  for (const entry of raw as unknown[]) {
    const m = entry as { role?: unknown; content?: unknown }
    if (typeof m?.role !== 'string' || !ALLOWED_ROLES.has(m.role)) {
      return { error: 'each message needs a role of system, user or assistant', status: 400 }
    }
    if (typeof m.content !== 'string') {
      return { error: 'each message needs string content', status: 400 }
    }
    total += m.content.length
    if (total > MAX_TOTAL_CHARS) {
      return { error: 'payload too large', status: 413 }
    }
    messages.push({ role: m.role as Message['role'], content: m.content })
  }
  return messages
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'AI service is not configured' }, 503)

  const guard = await authenticate(request)
  if (!guard.ok) return guard.response
  const { callerId } = guard

  // The rate-limit RPC is the one thing RLS deliberately blocks, so it needs the
  // elevated client. Fail closed: a deployment without the key has no throttle,
  // and an unthrottled paid proxy is the thing this route must never be again.
  const adminClient = adminClientOrNull()
  if (!adminClient) return json({ error: 'Server configuration error' }, 503)

  const [burst, daily] = await Promise.all([
    adminClient.rpc('consume_auth_rate_limit', {
      p_bucket: `ai-chat:user:${callerId}`,
      p_window_seconds: USER_WINDOW,
      p_limit: USER_LIMIT,
    }),
    adminClient.rpc('consume_auth_rate_limit', {
      p_bucket: `ai-chat:user-daily:${callerId}:${clientIp(request)}`,
      p_window_seconds: USER_DAILY_WINDOW,
      p_limit: USER_DAILY_LIMIT,
    }),
  ])
  const denied = (r: { data: unknown }) =>
    (r.data as { allowed?: boolean } | null)?.allowed === false
  if (denied(burst) || denied(daily)) {
    return json({ error: 'Too many requests. Please try again in a few minutes.' }, 429)
  }

  let body: {
    messages?: unknown
    temperature?: number
    max_tokens?: number
    model?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const messages = sanitizeMessages(body.messages)
  if (!Array.isArray(messages)) return json({ error: messages.error }, messages.status)

  const model = ALLOWED_MODELS.includes(body.model || '') ? body.model : 'gpt-4o-mini'
  const temperature =
    typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 2) : 0.7
  const max_tokens = typeof body.max_tokens === 'number' ? Math.min(body.max_tokens, 4000) : 1000

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      return json(
        { error: `AI error: ${res.status}`, detail: errorText.slice(0, 200) },
        res.status
      )
    }

    const data = await res.json()
    return json(data, 200)
  } catch {
    return json({ error: 'Failed to reach AI service' }, 502)
  }
}
