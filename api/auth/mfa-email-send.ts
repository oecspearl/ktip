import { createClient } from '@supabase/supabase-js'
import { clientIp } from '../_lib/client-ip'
import { emailFrom, resendKey } from '../_lib/email'
import { escapeHtml, renderEmail, sendEmail } from '../_lib/email-layout'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Send the six-digit email code for the second step (150).
 *
 * This route exists because the code must never pass through the browser that
 * holds the password. issue_mfa_email_code() returns the plaintext and is
 * therefore callable by the service role only; the caller's own session proves
 * who is asking, this route reads the session id off the token GoTrue has just
 * validated, mints the code with the service role, and mails it to the account's
 * own address — never to one supplied in the request.
 *
 * Verification does not come back here. verify_mfa_email_code() runs on the
 * caller's session directly, because it needs nothing the browser lacks.
 *
 * The page calls this every time it opens, so an ordinary call first asks
 * whether this session already has a code on its way and, if so, answers with
 * when it was sent instead of mailing another (159). Only `{ force: true }` —
 * the "Send a new code" button — always mints. Before that, a reload or a
 * second tab mailed a fresh code, spent one of five sends an hour, and left the
 * member with two emails and no way to tell which one counted.
 */

/**
 * The `session_id` claim from an access token getUser() has already accepted.
 * Decoded, not verified — verification happened in the getUser() round-trip,
 * and this is the same string. Edge has atob() but not Buffer.
 */
function sessionIdFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const claims = JSON.parse(atob(padded)) as { session_id?: unknown }
    const id = typeof claims.session_id === 'string' ? claims.session_id : null
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
  } catch {
    return null
  }
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'Server configuration error' }, 503)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller?.email) return json({ error: 'Unauthorized' }, 401)

  const sessionId = sessionIdFromToken(authHeader.slice('Bearer '.length))
  if (!sessionId) {
    // A token with no session claim is not a user session. Fail closed rather
    // than mint a code nothing could ever redeem.
    return json({ error: 'This sign-in cannot use an email code. Sign out and back in.' }, 400)
  }

  const body = (await request.json().catch(() => null)) as { force?: unknown } | null
  const force = body?.force === true

  const admin = createClient(supabaseUrl, serviceKey)
  const apiKey = resendKey()
  const fromEmail = emailFrom()

  // Skipped when mail is unconfigured: the dev fallback hands the code back in
  // the response, and an answer of "already sent" would leave nothing to type.
  // A database without 159 errors here and falls through to minting, which is
  // exactly what this route did before.
  if (!force && apiKey && fromEmail) {
    const { data: open } = await admin.rpc('mfa_email_open_code', {
      p_user: caller.id,
      p_session_id: sessionId,
    })
    const live = open as { sent_at?: string; expires_at?: string } | null
    if (live?.sent_at && live.expires_at) {
      return json({ ok: true, reused: true, sent_at: live.sent_at, expires_at: live.expires_at }, 200)
    }
  }

  // The per-account limit lives inside the RPC. This one is per address, so a
  // takeover attempt cycling through accounts still runs out of road. Sixty,
  // not twenty: a whole office signs in from one address, and twenty sends an
  // hour was a training session's worth of colleagues locking each other out.
  const { data: ipLimit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `mfa-email-send:ip:${clientIp(request)}`,
    p_window_seconds: 3600,
    p_limit: 60,
  })
  const ip = ipLimit as { allowed?: boolean; retry_after?: number } | null
  if (ip && ip.allowed === false) {
    return json(
      { error: 'Too many codes requested.', reason: 'rate_limited', retry_after: ip.retry_after ?? null },
      429,
    )
  }

  const { data, error } = await admin.rpc('issue_mfa_email_code', {
    p_user: caller.id,
    p_session_id: sessionId,
  })
  if (error) return json({ error: 'Could not send a code right now.' }, 500)

  const result = data as
    | { ok: true; code: string; expires_at: string }
    | { ok: false; reason?: string; retry_after?: number }
    | null
  if (!result || result.ok !== true) {
    const failure = result && result.ok === false ? result : undefined
    if (failure?.reason === 'rate_limited') {
      return json(
        { error: 'Too many codes requested.', reason: 'rate_limited', retry_after: failure.retry_after ?? null },
        429,
      )
    }
    if (failure?.reason === 'totp_enrolled') {
      return json({ error: 'This account uses an authenticator app.' }, 409)
    }
    return json({ error: 'Could not send a code right now.' }, 400)
  }

  if (!apiKey || !fromEmail) {
    // On a local machine that opted in, hand the code back so the flow is
    // testable without Resend. The opt-in is explicit (KTIP_DEV_ECHO_CODES=1)
    // because "not production" also covers Preview deploys, which are public
    // URLs: a preview with Resend unset used to return a live second factor to
    // anyone holding the password. Production refuses even with the flag set.
    if (process.env.VERCEL_ENV !== 'production' && process.env.KTIP_DEV_ECHO_CODES === '1') {
      console.log(`[mfa-email-send] code (dev only): ${result.code}`)
      return json(
        { ok: true, sent_at: new Date().toISOString(), expires_at: result.expires_at, dev_code: result.code },
        200,
      )
    }
    return json(
      {
        error:
          'Email delivery is not configured yet. Ask an administrator to set RESEND_API_KEY and EMAIL_FROM.',
      },
      503,
    )
  }

  // Spaced so it reads as two groups; the OTP field strips the space on paste.
  const shown = `${result.code.slice(0, 3)} ${result.code.slice(3)}`
  const lifetime = 'It works for 10 minutes, in the browser where you asked for it.'
  // Plain, because alarm words ("someone may know your password") are what
  // phishing mail is made of, and filters score them that way.
  const ignore =
    "Didn't try to sign in? You can ignore this email. If these keep arriving, change your KTIP password."
  const html = renderEmail({
    title: 'Your KTIP sign-in code',
    // The inbox preview line carries the code, so a phone can read it from the
    // notification without opening the message.
    preheader: `Your code is ${result.code}. It works for 10 minutes.`,
    eyebrow: 'Two-step verification',
    bodyHtml:
      `<p style="margin:0 0 16px;">Enter this code on KTIP to finish signing in:</p>` +
      `<p style="margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;letter-spacing:.18em;font-weight:700;color:#041E42;">${escapeHtml(shown)}</p>` +
      `<p style="margin:0;color:#8C8C86;">${escapeHtml(lifetime)}</p>`,
    footerHtml: escapeHtml(ignore),
  })
  const text = [
    `Your KTIP sign-in code is ${shown}`,
    '',
    `Enter it on KTIP to finish signing in. ${lifetime}`,
    '',
    ignore,
  ].join('\n')

  const sent = await sendEmail({
    apiKey,
    from: fromEmail,
    to: [caller.email],
    subject: `${result.code} is your KTIP code`,
    html,
    text,
  })
  if (!sent.sent) {
    return json({ error: 'The code could not be emailed. Try again in a moment.' }, 502)
  }

  return json({ ok: true, sent_at: new Date().toISOString(), expires_at: result.expires_at }, 200)
}
