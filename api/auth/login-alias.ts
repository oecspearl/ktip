import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

/**
 * Signs in with a verified secondary email address.
 *
 * The client calls this ONLY after supabase.auth.signInWithPassword has already
 * failed with "Invalid login credentials", so ordinary logins never reach it.
 *
 * SECURITY NOTES — read before changing anything here:
 *
 *  1. This is an unauthenticated password-verification oracle. Its requests
 *     reach GoTrue from Vercel's egress IPs, so GoTrue's own per-IP limiter
 *     sees one shared client and offers no protection. The DB limiter below is
 *     the ONLY limiter on this route.
 *  2. The primary email address is never returned. Resolution and the sign-in
 *     both happen here; the response carries session tokens and nothing else.
 *     (The primary is inside the JWT the client is about to install, which is
 *     unavoidable and fine — the rule is about the pre-authentication state.)
 *  3. Every failure except 429 returns the same status and the same body, and
 *     every response is padded to the same floor, so an attacker cannot tell
 *     "no such alias" from "wrong password". The string is byte-identical to
 *     GoTrue's so the existing LoginPage error mapping renders it unchanged.
 *  4. Rate-limit buckets are consumed BEFORE any lookup and unconditionally, so
 *     the counters can never encode whether an address exists.
 */

const IP_LIMIT = 10
const IP_WINDOW = 900
const EMAIL_LIMIT = 5
const EMAIL_WINDOW = 900
const IP_DAILY_LIMIT = 100
const IP_DAILY_WINDOW = 86400

/**
 * Floor for every identity-dependent response. Must sit above the slowest real
 * path (two RPCs + a bcrypt verify). If any path ever exceeds it, the padding
 * silently stops equalising — re-measure if you add work to this handler.
 */
const FLOOR_MS = 700

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FAIL_BODY = { error: 'Invalid login credentials' }

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
  // Truncate IPv6 to the /64, or anyone holding a /64 rotates for free.
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':')
  return raw
}

/** Buckets store a hash so auth_rate_limits can never become an address list. */
async function emailKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export default async function handler(request: Request) {
  const started = Date.now()

  /** Pads to FLOOR_MS so timing cannot distinguish outcomes. */
  const settle = async (body: unknown, status: number) => {
    const elapsed = Date.now() - started
    if (elapsed < FLOOR_MS) await new Promise((r) => setTimeout(r, FLOOR_MS - elapsed))
    return json(body, status)
  }

  // Configuration failures, not identity failures — no padding, no disguise.
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Server configuration error' }, 503)
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return settle(FAIL_BODY, 400)
  }

  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  if (!EMAIL_RE.test(email) || email.length > 254 || !password || password.length > 1024) {
    return settle(FAIL_BODY, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const ip = clientIp(request)
  const hashed = await emailKey(email)

  // All three consumed unconditionally — no short-circuit, so the counters
  // never leak ordering information.
  const [ipLimit, emailLimit, dailyLimit] = await Promise.all([
    admin.rpc('consume_auth_rate_limit', {
      p_bucket: `login-alias:ip:${ip}`,
      p_window_seconds: IP_WINDOW,
      p_limit: IP_LIMIT,
    }),
    admin.rpc('consume_auth_rate_limit', {
      p_bucket: `login-alias:email:${hashed}`,
      p_window_seconds: EMAIL_WINDOW,
      p_limit: EMAIL_LIMIT,
    }),
    admin.rpc('consume_auth_rate_limit', {
      p_bucket: `login-alias:ipday:${ip}`,
      p_window_seconds: IP_DAILY_WINDOW,
      p_limit: IP_DAILY_LIMIT,
    }),
  ])

  const blocked = [ipLimit, emailLimit, dailyLimit]
    .map((r) => r.data as { allowed: boolean; retry_after: number } | null)
    .filter((r) => r && r.allowed === false)

  if (blocked.length > 0) {
    const retryAfter = Math.max(...blocked.map((r) => r!.retry_after || 0))
    console.warn(`[login-alias] rate limited ip=${ip}`)
    return settle(
      { error: 'Too many attempts. Please try again later.', retry_after: retryAfter },
      429
    )
  }

  const { data: resolved } = await admin.rpc('resolve_email_alias', { p_email: email })
  const alias = resolved as
    | { user_id: string; verified: boolean; primary_email: string; primary_conflict: boolean }
    | null

  // No alias, or the address has since become somebody's primary — in which
  // case that account owns it and this route must not touch it.
  if (!alias?.primary_email || alias.primary_conflict) {
    return settle(FAIL_BODY, 400)
  }

  // persistSession/autoRefresh must be off: the edge runtime has no storage,
  // and this client is discarded after one call.
  const loginClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: signIn, error: signInError } = await loginClient.auth.signInWithPassword({
    email: alias.primary_email,
    password,
  })

  if (signInError || !signIn?.session) {
    return settle(FAIL_BODY, 400)
  }

  // Only reachable once the password has been proven, so naming the reason here
  // discloses nothing to anyone who does not already hold the credentials.
  if (!alias.verified) {
    // Local scope only — a global sign-out would kill the user's other devices.
    await admin.auth.admin
      .signOut(signIn.session.access_token, 'local')
      .catch(() => {
        /* token never left this function; it lapses on its own */
      })
    return settle({ error: 'unverified_alias' }, 403)
  }

  console.log(`[login-alias] success ip=${ip}`)

  return settle(
    {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      expires_at: signIn.session.expires_at,
    },
    200
  )
}
