import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

/**
 * Confirms a secondary email address from the token mailed by add-alias.
 *
 * Unauthenticated by design: possession of the token already proves control of
 * the alias mailbox, and account ownership was proven by the Bearer token back
 * at add-alias. Demanding a signed-in session here would mean signing in on
 * whatever device happens to hold the mailbox, which closes no attack.
 *
 * POST, not GET. Corporate link scanners (Outlook Safe Links, Proofpoint) and
 * mail-client prefetchers issue GETs — a GET-verifies design would confirm
 * addresses with no human involved, defeating the point of verifying at all.
 * The emailed link opens a page whose button POSTs here.
 */

const TOKEN_RE = /^[0-9a-f]{64}$/
const IP_HOURLY_LIMIT = 20

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Vercel's proxy overwrites all three, so none of them is client-controlled. */
function clientIp(request: Request): string {
  const raw =
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-vercel-forwarded-for') || '').split(',')[0].trim() ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  if (!raw) return 'unknown'
  // Truncate IPv6 to the /64 — otherwise anyone with a /64 allocation rotates
  // addresses for free and the per-IP bucket is meaningless.
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':')
  return raw
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 503)
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_token' }, 400)
  }

  const token = String(body?.token ?? '')
  if (!TOKEN_RE.test(token)) return json({ error: 'invalid_token' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `verify:ip:${clientIp(request)}`,
    p_window_seconds: 3600,
    p_limit: IP_HOURLY_LIMIT,
  })
  if (limit && (limit as any).allowed === false) {
    return json({ error: 'rate_limited', retry_after: (limit as any).retry_after }, 429)
  }

  const { data, error } = await admin.rpc('verify_email_alias', { p_token: token })
  if (error) return json({ error: 'server_error' }, 500)

  const result = data as { ok: boolean; reason?: string; email?: string } | null
  if (result?.ok) return json({ success: true, email: result.email }, 200)

  // Raw reason codes — the page maps them to copy.
  switch (result?.reason) {
    case 'expired':
      return json({ error: 'expired' }, 410)
    case 'email_taken':
      return json({ error: 'email_taken' }, 409)
    default:
      // Consumed tokens are nulled rather than stored, so a second click on a
      // link that worked also lands here.
      return json({ error: 'not_found' }, 404)
  }
}
