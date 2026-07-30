import { createClient } from '@supabase/supabase-js'
import { readVcConfig } from '../../_lib/vc-oidc'

export const config = { runtime: 'edge' }

/**
 * KTIP-initiated Virtual Campus sign-in — the "Sign in with OECS Virtual
 * Campus" button on /login.
 *
 * The other direction (learner presses "Go to KTIP" on the campus) needs none
 * of this: the campus mints a signed assertion and api/auth/vc/callback.ts
 * verifies it. Starting from KTIP means running the ordinary authorization-code
 * flow, and the Virtual Campus makes PKCE mandatory — an /authorize request
 * without code_challenge is answered with
 * {"error":"invalid_request","error_description":"Missing required parameters"}
 * regardless of what else is present.
 *
 * PKCE needs the verifier to survive the round trip to the provider and back.
 * A cookie would be the conventional place, but the callback is reached by a
 * cross-site redirect where SameSite=Lax cookies are unreliable enough to be
 * worth avoiding. Instead the verifier is stored server-side against the state
 * value, in the same one-shot table the session handoff uses.
 */

const IP_LIMIT = 20
const IP_WINDOW = 900
const STATE_TTL_SECONDS = 600

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new Uint8Array(digest)
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomHex(byteLength: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(byteLength)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(value: string): Promise<string> {
  return Array.from(await sha256Bytes(value))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

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

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origin = url.origin

  const redirectToLogin = (code: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/login?vc_error=${encodeURIComponent(code)}`,
        'Cache-Control': 'no-store',
      },
    })

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const cfg = readVcConfig()
  if (!supabaseUrl || !serviceKey || !cfg) return redirectToLogin('not_configured')

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `vc-start:ip:${clientIp(request)}`,
    p_window_seconds: IP_WINDOW,
    p_limit: IP_LIMIT,
  })
  if ((limit as { allowed?: boolean } | null)?.allowed === false) {
    return redirectToLogin('rate_limited')
  }

  // RFC 7636 allows 43–128 characters from an unreserved set; 64 hex characters
  // sits comfortably inside that and needs no encoding anywhere it travels.
  const codeVerifier = randomHex(32)
  const codeChallenge = base64Url(await sha256Bytes(codeVerifier))
  const state = randomHex(16)
  const nonce = randomHex(16)

  const { error } = await admin.from('vc_handoff_tickets').insert({
    // Namespaced so a state value can never be redeemed as a session ticket by
    // the /api/auth/vc/session route, which hashes the bare ticket.
    token_hash: await sha256Hex(`pkce:${state}`),
    user_id: null,
    payload: { code_verifier: codeVerifier, nonce },
    expires_at: new Date(Date.now() + STATE_TTL_SECONDS * 1000).toISOString(),
  })
  if (error) return redirectToLogin('state_failed')

  const authorize = new URL(cfg.authorizeUrl)
  authorize.searchParams.set('client_id', cfg.clientId)
  // Must match the URI registered with the Virtual Campus for this client, and
  // it is the SPA-facing path, not /api/... — vercel.json rewrites it.
  authorize.searchParams.set('redirect_uri', `${origin}/auth/vc/callback`)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('scope', 'openid profile email')
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('nonce', nonce)
  authorize.searchParams.set('code_challenge', codeChallenge)
  authorize.searchParams.set('code_challenge_method', 'S256')

  return new Response(null, {
    status: 302,
    headers: { Location: authorize.toString(), 'Cache-Control': 'no-store' },
  })
}
