import { createClient } from '@supabase/supabase-js'
import { emailFrom, resendKey } from '../_lib/email'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Close out the retention windows opened by migration 140.
 *
 * WHY A JOB AND NOT A TRIGGER. The window is the whole point — 90 days for a
 * deactivation, 7 for a scheduled deletion — and nothing happens in the
 * database at the moment it expires. Something has to come looking, and if
 * nothing does, "we keep it for a finite period" quietly becomes "we keep it".
 *
 * TWO ENDINGS, and they are not the same act:
 *
 *   deactivated       anonymise. The row stays so every foreign key pointing at
 *                     it stays; the person leaves it.
 *   pending_deletion  purge. The profile goes, and with it everything that
 *                     cascades from it; then the auth user, which SQL cannot
 *                     reach and only the service role can delete.
 *
 * AUTH is the same shape as the KPI snapshot: a shared secret, compared without
 * short-circuiting, and a refusal to run at all when it is unset. This endpoint
 * deletes accounts. An unauthenticated one would be the worst hole on the
 * platform.
 *
 * FAILURE IS PER-ACCOUNT. One member whose deletion errors must not stop the
 * other 499, and must not be silently skipped either — the response names them.
 */

/** Length-safe, non-short-circuiting compare — a timing oracle on a shared secret is still an oracle. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface DueAccount {
  user_id: string
  account_status: 'deactivated' | 'pending_deletion'
  purge_after: string
}

const DAY = 'en-GB'

function warningEmailHtml(params: {
  status: 'deactivated' | 'pending_deletion'
  closesOn: string
  siteUrl: string
}): string {
  const deleting = params.status === 'pending_deletion'
  const what = deleting
    ? 'your account and personal data will be permanently deleted'
    : 'your account will be anonymised — your name, photo and profile details removed'

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#2f2a24">
  <div style="max-width:520px;margin:0 auto;background:#fffdf9;border:1px solid #e7ded1;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">You still have time to keep your KTIP account</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6">
      On <strong>${params.closesOn}</strong>, ${what}.
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
      If you want to keep it, just sign in before then. That is all it takes — nothing has been
      removed yet.
    </p>
    <p style="margin:0 0 24px">
      <a href="${params.siteUrl}/login"
         style="display:inline-block;background:#1f6f8b;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:15px;font-weight:600">
        Sign in and keep my account
      </a>
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#7a7065">
      If you meant to leave, you do not need to do anything. This is the only reminder we will send.
    </p>
  </div>
</body></html>`
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

  // ── Pass 1: remind the people whose window is about to close ────────────
  //
  // Before the purge pass, deliberately. If a run is late enough that somebody
  // is both due a warning and due to be purged, they are past the notice period
  // and the warning would be a lie; accounts_due_for_closure_warning() excludes
  // them, and doing this first keeps the two passes from racing on one row.
  const warned: string[] = []
  const warnFailed: { user_id: string; detail: string }[] = []
  const apiKey = resendKey()
  const fromEmail = emailFrom()
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '')

  if (apiKey && fromEmail && siteUrl) {
    const { data: pending, error: warnError } = await admin.rpc(
      'accounts_due_for_closure_warning'
    )
    if (warnError) {
      warnFailed.push({ user_id: '-', detail: warnError.message })
    }

    for (const account of (pending || []) as DueAccount[]) {
      const { data: authUser } = await admin.auth.admin.getUserById(account.user_id)
      const to = authUser?.user?.email
      if (!to) {
        // Nothing to send to, and nothing to retry tomorrow either.
        await admin.rpc('mark_closure_warned', { p_user: account.user_id })
        continue
      }

      const closesOn = new Date(account.purge_after).toLocaleDateString(DAY, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject:
            account.account_status === 'pending_deletion'
              ? 'Your KTIP account is deleted in 2 days'
              : 'Your KTIP account is anonymised in 7 days',
          html: warningEmailHtml({
            status: account.account_status,
            closesOn,
            siteUrl,
          }),
        }),
      })

      if (!res.ok) {
        // Left unmarked on purpose: tomorrow's run tries again, which is the
        // right answer for a transient provider failure and harmless for a
        // permanent one — the window closes either way.
        warnFailed.push({
          user_id: account.user_id,
          detail: `resend ${res.status}`,
        })
        continue
      }

      await admin.rpc('mark_closure_warned', { p_user: account.user_id })
      warned.push(account.user_id)
    }
  }

  // ── Pass 2: close out the windows that have expired ──────────────────────
  const { data, error } = await admin.rpc('accounts_due_for_purge')
  if (error) {
    return json({ error: 'could not read the purge queue', detail: error.message }, 502)
  }

  const due = (data || []) as DueAccount[]
  const anonymised: string[] = []
  const purged: string[] = []
  const failed: { user_id: string; step: string; detail: string }[] = []

  for (const account of due) {
    if (account.account_status === 'deactivated') {
      const { error: anonError } = await admin.rpc('anonymise_account', { p_user: account.user_id })
      if (anonError) {
        failed.push({ user_id: account.user_id, step: 'anonymise', detail: anonError.message })
        continue
      }
      anonymised.push(account.user_id)
      continue
    }

    // Profile first: purge_account() detaches the records that must outlive the
    // leaver before deleting the row. Doing the auth user first would leave a
    // profile nobody can sign into and nothing scheduled to clean it up.
    const { error: purgeError } = await admin.rpc('purge_account', { p_user: account.user_id })
    if (purgeError) {
      failed.push({ user_id: account.user_id, step: 'purge', detail: purgeError.message })
      continue
    }

    const { error: authError } = await admin.auth.admin.deleteUser(account.user_id)
    if (authError) {
      // The profile is already gone, so this is an orphaned auth user rather
      // than a half-deleted member. Named loudly: it needs a hand.
      failed.push({ user_id: account.user_id, step: 'auth-delete', detail: authError.message })
      continue
    }

    purged.push(account.user_id)
  }

  return json(
    {
      ok: failed.length === 0 && warnFailed.length === 0,
      emailConfigured: !!(apiKey && fromEmail && siteUrl),
      warned: warned.length,
      warnFailed,
      due: due.length,
      anonymised: anonymised.length,
      purged: purged.length,
      failed,
    },
    failed.length === 0 && warnFailed.length === 0 ? 200 : 207
  )
}
