import { createClient } from '@supabase/supabase-js'
import { emailFrom, resendKey } from '../_lib/email'
import { escapeHtml, renderEmail, sendEmail } from '../_lib/email-layout'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * The daily pass over verification terms (migration 175).
 *
 * run_verification_expiry() does the database half in one call: it writes the
 * in-app reminders, lapses what is due, logs both, and hands back who to email.
 * This route sends that mail.
 *
 * NOT OPTIONAL MAIL. Whether an account can publish is account status, like
 * the retention warnings in purge-accounts.ts, so emailAllowed() is not asked.
 *
 * A failed send is reported, not retried: the reminder is already recorded in
 * the database and shown in the app, and the next stage (or the lapse notice)
 * goes out by email regardless.
 *
 * AUTH: the same CRON_SECRET as the other jobs, compared without
 * short-circuiting, and a refusal to run when it is unset.
 */

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface Reminder {
  user_id: string
  email: string | null
  display_name: string | null
  days_left: number
  verified_until: string
  via: string | null
}

interface Lapsed {
  user_id: string
  email: string | null
  display_name: string | null
  via: string | null
}

const DAY = 'en-GB'

export function reminderEmail(r: Reminder, siteUrl: string) {
  const ends = new Date(r.verified_until).toLocaleDateString(DAY, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const byCode = r.via === 'org_code'
  const how = byCode
    ? 'Your badge came from a code your organisation gave you. Ask them for a new one and enter it on the Verification page.'
    : 'Your badge came from your work or school email address. Open the Verification page and confirm that address again. It takes a minute.'
  const subject = `Your KTIP verification ends on ${ends}`
  return {
    subject,
    html: renderEmail({
      title: 'Keep your verified badge',
      preheader: `Renew before ${ends} to keep posting and applying.`,
      bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(r.display_name || 'there')},</p>
<p style="margin:0 0 12px;">Your verified badge on KTIP ends on <strong>${escapeHtml(ends)}</strong>.</p>
<p style="margin:0;">${escapeHtml(how)}</p>`,
      cta: { label: 'Renew my verification', url: `${siteUrl}/settings?tab=verification` },
      footerHtml:
        'If you have left that organisation, you can verify another way from the same page. Nothing you published will be removed.',
    }),
    text: `Your verified badge on KTIP ends on ${ends}. ${how} ${siteUrl}/settings?tab=verification`,
  }
}

export function lapsedEmail(r: Lapsed, siteUrl: string) {
  return {
    subject: 'Your KTIP verification has ended',
    html: renderEmail({
      title: 'Your verified badge has ended',
      preheader: 'Verify again to post, apply and message.',
      bodyHtml: `<p style="margin:0 0 12px;">Hello ${escapeHtml(r.display_name || 'there')},</p>
<p style="margin:0 0 12px;">Your badge depended on a work or school address or a code, and it was not renewed, so it has ended.</p>
<p style="margin:0;">You can still read everything on KTIP, and nothing you published has been removed. To post, apply for funding or start conversations again, verify from the Verification page.</p>`,
      cta: { label: 'Verify again', url: `${siteUrl}/settings?tab=verification` },
    }),
    text: `Your KTIP verified badge has ended because it was not renewed. Verify again at ${siteUrl}/settings?tab=verification`,
  }
}

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return json({ error: 'CRON_SECRET is not configured' }, 503)
  }

  const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!presented || !secretsMatch(presented, secret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Supabase credentials are not configured' }, 503)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data, error } = await admin.rpc('run_verification_expiry', { p_batch: 500 })
  if (error) {
    return json({ error: 'run_verification_expiry failed', detail: error.message }, 502)
  }

  const result = (data || {}) as { reminders?: Reminder[]; lapsed?: Lapsed[] }
  const reminders = result.reminders ?? []
  const lapsed = result.lapsed ?? []

  const apiKey = resendKey()
  const fromEmail = emailFrom()
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '')
  const mailFailed: { user_id: string; detail: string }[] = []
  let mailed = 0

  if (apiKey && fromEmail && siteUrl) {
    const outbox = [
      ...reminders.map((r) => ({ user_id: r.user_id, to: r.email, ...reminderEmail(r, siteUrl) })),
      ...lapsed.map((r) => ({ user_id: r.user_id, to: r.email, ...lapsedEmail(r, siteUrl) })),
    ]
    for (const m of outbox) {
      if (!m.to) continue
      const sent = await sendEmail({
        apiKey,
        from: fromEmail,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
      }).catch((e: unknown) => ({ sent: false, reason: String(e) }))
      if (sent.sent) mailed++
      else mailFailed.push({ user_id: m.user_id, detail: sent.reason || 'send failed' })
    }
  }

  return json(
    {
      reminded: reminders.length,
      lapsed: lapsed.length,
      mailed,
      mail_configured: Boolean(apiKey && fromEmail && siteUrl),
      mail_failed: mailFailed,
    },
    200
  )
}
