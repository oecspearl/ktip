import { createClient } from '@supabase/supabase-js'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'

export const config = { runtime: 'edge' }

/**
 * Sends a password-recovery link to a verified secondary email address.
 *
 * This is the half of the feature that actually makes an account recoverable:
 * if the primary inbox is dead, signing in with the alias only helps while the
 * password is still remembered.
 *
 * SECURITY NOTES:
 *
 *  1. Always answers 200, for everything except 405/503/429 — malformed input,
 *     unknown address, unverified alias, and even a Resend outage. An
 *     unauthenticated route must reveal neither which addresses exist nor
 *     whether the server is correctly configured. This deliberately differs
 *     from api/invite/send.ts, which is authenticated and may return 503.
 *  2. generateLink is used rather than resetPasswordForEmail because it
 *     decouples "whose account" from "which mailbox": the link is minted for
 *     the primary account but delivered to the alias, so whoever holds the
 *     alias mailbox never learns the primary address.
 *  3. The client calls this in parallel with the normal resetPasswordForEmail.
 *     resolve_email_alias's primary_conflict flag is what guarantees at most
 *     one of the two ever sends anything.
 */

const IP_LIMIT = 5
const IP_WINDOW = 3600
const EMAIL_LIMIT = 3
const EMAIL_WINDOW = 3600
const FLOOR_MS = 500

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OK_BODY = { success: true }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Names no account and shows no primary address — the recipient may not own it. */
function recoveryEmailHtml(params: { aliasEmail: string; actionLink: string }) {
  const { aliasEmail, actionLink } = params
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">KTIP</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Reset your password</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
      A password reset was requested using <strong>${escapeHtml(aliasEmail)}</strong>, which is
      registered as a secondary email on a KTIP account.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Use the link below to choose a new password. It signs in to the same account either
      address reaches.
    </p>
    <a href="${actionLink}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Reset password</a>
    <p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">
      If you didn't request this, ignore this email — your password will not change.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${actionLink}</p>
  </div>
</body></html>`
}

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

async function emailKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export default async function handler(request: Request) {
  const started = Date.now()
  const settle = async (body: unknown, status: number) => {
    const elapsed = Date.now() - started
    if (elapsed < FLOOR_MS) await new Promise((r) => setTimeout(r, FLOOR_MS - elapsed))
    return json(body, status)
  }

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
    return settle(OK_BODY, 200)
  }

  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) return settle(OK_BODY, 200)

  const admin = createClient(supabaseUrl, serviceKey)
  const ip = clientIp(request)
  const hashed = await emailKey(email)

  // Consumed before any lookup, so a 429 cannot correlate with existence.
  const [ipLimit, emailLimit] = await Promise.all([
    admin.rpc('consume_auth_rate_limit', {
      p_bucket: `reset-alias:ip:${ip}`,
      p_window_seconds: IP_WINDOW,
      p_limit: IP_LIMIT,
    }),
    admin.rpc('consume_auth_rate_limit', {
      p_bucket: `reset-alias:email:${hashed}`,
      p_window_seconds: EMAIL_WINDOW,
      p_limit: EMAIL_LIMIT,
    }),
  ])

  const blocked = [ipLimit, emailLimit]
    .map((r) => r.data as { allowed: boolean; retry_after: number } | null)
    .filter((r) => r && r.allowed === false)

  if (blocked.length > 0) {
    return settle(
      {
        error: 'Too many attempts. Please try again later.',
        retry_after: Math.max(...blocked.map((r) => r!.retry_after || 0)),
      },
      429
    )
  }

  const { data: resolved } = await admin.rpc('resolve_email_alias', { p_email: email })
  const alias = resolved as
    | { user_id: string; verified: boolean; primary_email: string; primary_conflict: boolean }
    | null

  // Unknown, unverified, or since claimed as somebody's primary — in the last
  // case GoTrue's own resetPasswordForEmail already handled it.
  if (!alias?.primary_email || !alias.verified || alias.primary_conflict) {
    return settle(OK_BODY, 200)
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: alias.primary_email,
    // Must be allow-listed under Supabase Auth → URL Configuration, or GoTrue
    // silently substitutes the project's own Site URL.
    options: { redirectTo: `${siteOrigin(request)}/reset-password` },
  })

  const actionLink = link?.properties?.action_link
  if (linkError || !actionLink) {
    console.error('[reset-alias] generateLink failed', linkError?.message)
    return settle(OK_BODY, 200)
  }

  const apiKey = resendKey()
  const fromEmail = emailFrom()
  if (!apiKey || !fromEmail) {
    // Dev only — never log a live recovery link from production.
    if (process.env.VERCEL_ENV !== 'production') {
      console.log(`[reset-alias] recovery link (dev only): ${actionLink}`)
    } else {
      console.error('[reset-alias] RESEND_API_KEY/EMAIL_FROM unset; recovery mail not sent')
    }
    return settle(OK_BODY, 200)
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'Reset your KTIP password',
      html: recoveryEmailHtml({ aliasEmail: email, actionLink }),
    }),
  })

  if (!resendResponse.ok) {
    // Still 200: a delivery failure must not become a probe signal.
    console.error('[reset-alias] resend failed', await resendResponse.text().catch(() => ''))
  }

  return settle(OK_BODY, 200)
}
