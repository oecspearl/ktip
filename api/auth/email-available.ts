import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

/**
 * Tells the signup form whether an address already belongs to an account.
 *
 * GoTrue deliberately will not: with email confirmation on, signUp() on a taken
 * address returns a fake user and no error, so the member is sent to the code
 * step and waits for a code that never comes. This route answers the question
 * up front so the field can be marked invalid while they are still on it.
 *
 * That is an enumeration oracle by construction, so it is a narrow one:
 *   - POST only, JSON only, one address at a time.
 *   - Per-IP hourly budget through consume_auth_rate_limit (056), same bucket
 *     scheme as verify-alias. Past the budget the answer is 429, not a guess.
 *   - Malformed input is 400 with no lookup, so the budget is only spent on
 *     addresses that could be accounts.
 *   - Any failure on our side is 'unknown', which the form treats as "let them
 *     continue" — the signUp() path still catches a real duplicate, exactly as
 *     it does today. A broken check must never block a signup.
 */

const IP_HOURLY_LIMIT = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
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
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 503)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_email' }, 400)
  }

  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'invalid_email' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `email-available:ip:${clientIp(request)}`,
    p_window_seconds: 3600,
    p_limit: IP_HOURLY_LIMIT,
  })
  if (limit && (limit as any).allowed === false) {
    return json({ error: 'rate_limited', retry_after: (limit as any).retry_after }, 429)
  }

  const { data, error } = await admin.rpc('email_in_use', { p_email: email })
  if (error) return json({ error: 'server_error' }, 500)

  return json({ in_use: data === true }, 200)
}
