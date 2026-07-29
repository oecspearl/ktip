import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

/**
 * Redeems a Virtual Campus handoff ticket for a Supabase session.
 *
 * api/auth/vc/callback.ts has already established who the user is and minted a
 * session. It cannot install that session itself — supabase-js keeps its
 * session in localStorage, which only the browser can write — and it must not
 * put the tokens in the redirect URL, because a URL lands in history and in
 * whatever the browser syncs. So the tokens stay server-side and the redirect
 * carries a short opaque ticket instead. This route trades that ticket in, once.
 *
 * The one-shot guarantee lives in SQL: vc_claim_handoff_ticket() marks the row
 * consumed and returns the payload in the same UPDATE, so two concurrent
 * redemptions race on the row lock and exactly one gets a session.
 *
 * Every failure returns the same body. A ticket that never existed, one that
 * expired and one that was already used are indistinguishable — there is
 * nothing useful to tell the client apart, and plenty to leak.
 */

const IP_LIMIT = 30
const IP_WINDOW = 900

const FAIL_BODY = { error: 'Invalid or expired handoff' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 503)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(FAIL_BODY, 400)
  }

  const ticket = String((body as { ticket?: unknown })?.ticket ?? '').trim()
  // 32 random bytes, hex-encoded by the callback. Anything else is not a ticket.
  if (!/^[0-9a-f]{64}$/.test(ticket)) return json(FAIL_BODY, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `vc-session:ip:${clientIp(request)}`,
    p_window_seconds: IP_WINDOW,
    p_limit: IP_LIMIT,
  })
  if ((limit as { allowed?: boolean } | null)?.allowed === false) {
    return json({ error: 'Too many attempts. Please try again later.' }, 429)
  }

  const { data: payload, error } = await admin.rpc('vc_claim_handoff_ticket', {
    p_token_hash: await sha256Hex(ticket),
  })

  if (error || !payload) return json(FAIL_BODY, 400)

  const session = payload as {
    access_token?: string
    refresh_token?: string
    expires_at?: number
    is_new_user?: boolean
    code_verifier?: string
  }

  // A PKCE state row uses the same table (see migration 068). It is not a
  // session and must never be handed to a browser as one.
  if (!session.access_token || !session.refresh_token) return json(FAIL_BODY, 400)

  return json(
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      is_new_user: session.is_new_user === true,
    },
    200
  )
}
