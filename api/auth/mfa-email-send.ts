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

  const admin = createClient(supabaseUrl, serviceKey)

  // The per-account limit lives inside the RPC. This one is per address, so a
  // takeover attempt cycling through accounts still runs out of road.
  const { data: ipLimit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `mfa-email-send:ip:${clientIp(request)}`,
    p_window_seconds: 3600,
    p_limit: 20,
  })
  if (ipLimit && (ipLimit as { allowed?: boolean }).allowed === false) {
    return json({ error: 'Too many codes requested. Wait a while and try again.' }, 429)
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
    const reason = result && result.ok === false ? result.reason : undefined
    if (reason === 'rate_limited') {
      return json({ error: 'Too many codes requested. Wait a while and try again.' }, 429)
    }
    if (reason === 'totp_enrolled') {
      return json({ error: 'This account uses an authenticator app.' }, 409)
    }
    return json({ error: 'Could not send a code right now.' }, 400)
  }

  const apiKey = resendKey()
  const fromEmail = emailFrom()
  if (!apiKey || !fromEmail) {
    // Outside production, hand the code back so the flow is testable without
    // Resend. Gated on VERCEL_ENV so a production misconfiguration can never
    // emit a live code into a response body or the logs.
    if (process.env.VERCEL_ENV !== 'production') {
      console.log(`[mfa-email-send] code (dev only): ${result.code}`)
      return json({ ok: true, expires_at: result.expires_at, dev_code: result.code }, 200)
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
  const html = renderEmail({
    title: 'Your KTIP sign-in code',
    // The inbox preview line carries the code, so a phone can read it from the
    // notification without opening the message.
    preheader: `Your code is ${result.code}. It works for 10 minutes.`,
    eyebrow: 'Two-step verification',
    bodyHtml:
      `<p style="margin:0 0 16px;">Enter this code on KTIP to finish signing in:</p>` +
      `<p style="margin:0 0 16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;letter-spacing:.18em;font-weight:700;color:#041E42;">${escapeHtml(shown)}</p>` +
      `<p style="margin:0;color:#8C8C86;">It works for 10 minutes and only once.</p>`,
    footerHtml:
      'If you did not try to sign in, someone may know your password. ' +
      'Change it from Dashboard, Security, and this code will do them no good — ' +
      'it only works from the device that asked for it.',
  })

  const sent = await sendEmail({
    apiKey,
    from: fromEmail,
    to: [caller.email],
    subject: `${result.code} is your KTIP code`,
    html,
  })
  if (!sent.sent) {
    return json({ error: 'The code could not be emailed. Try again in a moment.' }, 502)
  }

  return json({ ok: true, expires_at: result.expires_at }, 200)
}
