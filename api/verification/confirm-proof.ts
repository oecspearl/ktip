import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

/**
 * Consumes a work-or-school proof token mailed by send-proof (145).
 *
 * Unauthenticated by design, and POST only, for the reasons written on
 * api/auth/verify-alias.ts: possession of the token is the proof, and a GET
 * would let mail-client prefetchers and corporate link scanners confirm
 * addresses with nobody involved. The emailed link opens a page whose button
 * POSTs here.
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
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':')
  return raw
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
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

  const { data, error } = await admin.rpc('confirm_email_proof', { p_token: token })
  if (error) return json({ error: 'server_error' }, 500)

  const result = data as
    | {
        ok: boolean
        reason?: string
        outcome?: string
        email?: string
        domain?: string
        label?: string
        institution_name?: string
        granted_role?: string | null
      }
    | null

  // The token was consumed (ok from the proof's point of view) even when the
  // decision says the domain is not recognised — that is a real outcome the
  // page has to explain, not a failure to retry.
  if (result?.ok || result?.reason === 'domain_not_recognised') {
    return json(
      {
        success: true,
        email: result.email,
        outcome: result.outcome ?? result.reason,
        domain: result.domain,
        label: result.label,
        institution_name: result.institution_name,
        granted_role: result.granted_role ?? null,
      },
      200
    )
  }

  switch (result?.reason) {
    case 'expired':
      return json({ error: 'expired' }, 410)
    default:
      // Consumed tokens are nulled rather than stored, so a second click on a
      // link that worked also lands here.
      return json({ error: 'not_found' }, 404)
  }
}
