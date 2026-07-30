import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

/**
 * Registers a secondary email address on the caller's account and mails it a
 * verification link. The address does nothing until that link is confirmed.
 *
 * Ownership of the ACCOUNT is proven here by the caller's JWT; ownership of the
 * ADDRESS is proven later by clicking the link. Both are required before the
 * alias can sign in, because an unverified alias would let anyone attach an
 * address they do not control and turn this route into a spam relay.
 *
 *   - the token is minted here, never accepted from the client;
 *   - an address that already belongs to an account is refused, and the refusal
 *     is worded identically to the unique-violation refusal so the pair cannot
 *     be used to tell "is a member" apart from "is someone's alias";
 *   - a daily cap limits blast radius if an account is taken over.
 */

const TOKEN_TTL_HOURS = 24
const DAILY_SEND_LIMIT = 5

// Both the "already an account" and the "already someone's alias" refusals use
// this string. Do not make them distinguishable — see the docblock.
const IN_USE_MESSAGE = 'That email address is already in use.'

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Names the requesting account by display name only — never by its primary email. */
function verifyEmailHtml(params: { requesterName: string; verifyUrl: string }) {
  const { requesterName, verifyUrl } = params
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">KTIP</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Confirm your secondary email address</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
      The KTIP account belonging to <strong>${escapeHtml(requesterName)}</strong> added this
      address as a secondary email.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Once confirmed, this address can sign in to that account using the same password,
      and can be used to recover it.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Confirm this address</a>
    <p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">
      This link expires in ${TOKEN_TTL_HOURS} hours. If you weren't expecting it, ignore this
      email — nothing will be added to your address.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${verifyUrl}</p>
  </div>
</body></html>`
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
  if (!caller) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'Enter a valid email address.' }, 400)
  }
  if (email === caller.email?.toLowerCase()) {
    return json({ error: "That's already your primary email address." }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // --- Rate limit: cap verification mail per account per day ---
  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `alias-send:user:${caller.id}`,
    p_window_seconds: 86400,
    p_limit: DAILY_SEND_LIMIT,
  })
  if (limit && (limit as any).allowed === false) {
    return json(
      { error: `You can request up to ${DAILY_SEND_LIMIT} verification emails per day.` },
      429
    )
  }

  // --- The address must not already belong to an account ---
  const { data: existing } = await admin.rpc('get_user_id_by_email', { p_email: email })
  if (typeof existing === 'string' && existing) {
    return json({ error: IN_USE_MESSAGE }, 409)
  }

  // --- Reap an expired unverified squat on this address ---
  // Bounds the squatting window to the token TTL: parking someone else's
  // address cannot block them for longer than that.
  await admin
    .from('user_email_aliases')
    .delete()
    .eq('email', email)
    .is('verified_at', null)
    .lt('token_expires_at', new Date().toISOString())

  // --- What does the caller already have? ---
  const { data: mine } = await admin
    .from('user_email_aliases')
    .select('id, email, verified_at, send_count')
    .eq('user_id', caller.id)
    .maybeSingle()

  const mineRow = mine as
    | { id: string; email: string; verified_at: string | null; send_count: number }
    | null

  if (mineRow?.verified_at) {
    if (mineRow.email === email) {
      // Idempotent: already done, nothing to send.
      return json({ success: true, already_verified: true }, 200)
    }
    return json(
      { error: 'Remove your current secondary email address first.' },
      409
    )
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString()

  // One branch covers both "change the pending address" and "resend".
  const row = {
    user_id: caller.id,
    email,
    verification_token: token,
    token_expires_at: expiresAt,
    verified_at: null,
    last_sent_at: new Date().toISOString(),
    send_count: (mineRow?.send_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }

  const { error: writeError } = mineRow
    ? await admin.from('user_email_aliases').update(row).eq('id', mineRow.id)
    : await admin.from('user_email_aliases').insert(row)

  if (writeError) {
    // 23505 = the lower(email) unique index. Somebody else holds this address
    // as a pending alias. Word it exactly like the account collision above.
    if ((writeError as any).code === '23505') return json({ error: IN_USE_MESSAGE }, 409)
    return json({ error: writeError.message }, 400)
  }

  const origin = new URL(request.url).origin
  const verifyUrl = `${origin}/verify-email/${token}`

  // --- Send ---
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.INVITE_FROM_EMAIL
  if (!resendKey || !fromEmail) {
    // Outside production, hand the link back so the flow is testable without
    // Resend. Gated on VERCEL_ENV so a production misconfiguration can never
    // emit a live token into a response body or the logs.
    if (process.env.VERCEL_ENV !== 'production') {
      console.log(`[add-alias] verification link (dev only): ${verifyUrl}`)
      return json({ success: true, dev_link: verifyUrl }, 200)
    }
    // Leave no live token nobody received.
    await admin
      .from('user_email_aliases')
      .update({ verification_token: null, token_expires_at: null })
      .eq('user_id', caller.id)
    return json(
      { error: 'Email delivery is not configured yet. Ask an administrator to set RESEND_API_KEY.' },
      503
    )
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', caller.id)
    .maybeSingle()

  const requesterName = (profile as any)?.display_name || 'a KTIP member'

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'Confirm your secondary email address for KTIP',
      html: verifyEmailHtml({ requesterName, verifyUrl }),
    }),
  })

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => '')
    // Withdraw the token rather than leaving a live one nobody received.
    await admin
      .from('user_email_aliases')
      .update({ verification_token: null, token_expires_at: null })
      .eq('user_id', caller.id)
    return json({ error: `Failed to send the verification email. ${detail}`.trim() }, 502)
  }

  return json({ success: true }, 200)
}
