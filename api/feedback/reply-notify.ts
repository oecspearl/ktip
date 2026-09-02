import { requirePermission } from '../_lib/require-permission'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'

export const config = { runtime: 'edge' }

/**
 * Emails a reporter that the feedback they filed has been answered.
 *
 * The in-app notification (send_notification) is the primary channel; this is
 * the one that reaches someone who filed a bug and left — which is the normal
 * case, and the reason the channel was one-way until now.
 *
 * Deliberately narrow:
 *   - gated on org:manage, the same key that puts /admin/feedback in the
 *     console. Unlike the registration route this acts on somebody ELSE's row,
 *     so being signed in is not enough;
 *   - the browser names a report, never a recipient and never the text: both
 *     are re-read server-side from the row, so a compromised admin session
 *     cannot use this as a mail relay;
 *   - nothing is sent unless a reply has actually been saved — the endpoint
 *     announces a fact, it does not create one;
 *   - the reporter's address is resolved from auth.users and never returned;
 *   - an unconfigured or declined delivery is a 200 with sent:false. The reply
 *     is already in the row and the notification already landed.
 */

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

function replyEmailHtml(params: { subject: string; reply: string; feedbackUrl: string }) {
  const { subject, reply, feedbackUrl } = params

  // Whitespace is the whole formatting vocabulary of a plain-text reply, so the
  // paragraph preserves it rather than collapsing the admin's line breaks.
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">KTIP</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">We looked into your feedback</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      You wrote to us about <strong>${escapeHtml(subject)}</strong>. Here is what came of it:
    </p>
    <div style="margin:0 0 24px;padding:16px;background:#F5F5F2;border-radius:8px;">
      <p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(reply)}</p>
    </div>
    <a href="${feedbackUrl}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">See all your reports</a>
    <p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">
      You are getting this because you sent us feedback. Thank you for it.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${feedbackUrl}</p>
  </div>
</body></html>`
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'org:manage')
  if (!guard.ok) return guard.response
  const { adminClient } = guard

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const feedbackId = body?.feedback_id ? String(body.feedback_id) : null
  if (!feedbackId) return json({ error: 'feedback_id is required' }, 400)

  const { data: feedback } = await adminClient
    .from('feedback')
    .select('id, user_id, subject, admin_reply')
    .eq('id', feedbackId)
    .maybeSingle()

  if (!feedback) return json({ error: 'Feedback not found' }, 404)

  const reply = String((feedback as any).admin_reply ?? '').trim()
  if (!reply) return json({ sent: false, reason: 'no_reply' }, 200)

  const reporterId = (feedback as any).user_id as string | null
  // An anonymous report has nobody behind it. The admin UI disables the reply
  // box for these, so reaching here means the row changed underneath.
  if (!reporterId) return json({ sent: false, reason: 'anonymous_report' }, 200)

  // The bell entry ignores preferences by design (127 §4); the email does not.
  // A missing row means the member never touched the defaults, and 036 defaults
  // email to TRUE.
  const { data: prefs } = await adminClient
    .from('notification_preferences')
    .select('email')
    .eq('user_id', reporterId)
    .maybeSingle()

  if (prefs && (prefs as any).email === false) {
    return json({ sent: false, reason: 'email_disabled' }, 200)
  }

  const apiKey = resendKey()
  const fromEmail = emailFrom()
  if (!apiKey || !fromEmail) {
    return json({ sent: false, reason: 'email_not_configured' }, 200)
  }

  const { data: reporter } = await adminClient.auth.admin.getUserById(reporterId)
  const reporterEmail = reporter?.user?.email
  if (!reporterEmail) return json({ sent: false, reason: 'no_reporter_email' }, 200)

  const subject = String((feedback as any).subject ?? 'your feedback')

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [reporterEmail],
      subject: `Re: ${subject}`,
      html: replyEmailHtml({
        subject,
        reply,
        feedbackUrl: `${siteOrigin(request)}/settings?tab=feedback`,
      }),
    }),
  })

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => '')
    return json({ sent: false, reason: `resend_failed ${detail}`.trim() }, 200)
  }

  return json({ sent: true }, 200)
}
