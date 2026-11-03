import { authenticate, adminClientOrNull } from '../_lib/require-permission'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'

export const config = { runtime: 'edge' }

/**
 * Emails the recipient of a note from KTIP (migration 182).
 *
 * The bell entry is written by send_admin_note() in the same transaction as
 * the note. This is the half that reaches somebody who is not in the app,
 * modelled on api/feedback/reply-notify.ts:
 *
 *   - the browser names a note, never a recipient and never the text. Both
 *     are re-read here from the row with the service role, so this cannot be
 *     used as a mail relay;
 *   - only the author of a platform-side note may trigger its email. The note
 *     could only have been written by an administrator (send_admin_note
 *     checks), so "you wrote this admin note" is the whole permission test;
 *   - emailed_at is stamped after a send, and a stamped note is not sent
 *     again;
 *   - the recipient's address comes from auth.users and is never returned;
 *   - every non-delivery is a 200 with sent:false. The note and the
 *     notification already exist.
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

function noteEmailHtml(params: { heading: string; subject: string | null; body: string; notesUrl: string }) {
  const { heading, subject, body, notesUrl } = params
  const about = subject
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">About <strong>${escapeHtml(subject)}</strong>:</p>`
    : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">KTIP</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h1>
    ${about}
    <div style="margin:0 0 24px;padding:16px;background:#F5F5F2;border-radius:8px;">
      <p style="margin:0;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</p>
    </div>
    <a href="${notesUrl}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Read and reply</a>
    <p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">
      You are getting this because you look after this on KTIP.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${notesUrl}</p>
  </div>
</body></html>`
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const caller = await authenticate(request)
  if (!caller.ok) return caller.response

  const adminClient = adminClientOrNull()
  if (!adminClient) return json({ error: 'Server configuration error' }, 503)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const noteId = body?.note_id ? String(body.note_id) : null
  if (!noteId) return json({ error: 'note_id is required' }, 400)

  const { data: note } = await adminClient
    .from('admin_notes')
    .select('id, kind, subject, body, from_admin, created_by, recipient_user_id, employer_id, emailed_at')
    .eq('id', noteId)
    .maybeSingle()

  // The same answer for "missing" and "not yours", as in send_admin_note().
  if (!note || (note as any).created_by !== caller.callerId || !(note as any).from_admin) {
    return json({ error: 'Note not found' }, 404)
  }

  if ((note as any).emailed_at) return json({ sent: false, reason: 'already_sent' }, 200)

  let recipientId = (note as any).recipient_user_id as string | null
  if (!recipientId && (note as any).employer_id) {
    const { data: employer } = await adminClient
      .from('employers')
      .select('created_by')
      .eq('id', (note as any).employer_id)
      .maybeSingle()
    recipientId = ((employer as any)?.created_by as string | null) ?? null
  }
  if (!recipientId) return json({ sent: false, reason: 'no_recipient' }, 200)

  // A missing preferences row means the defaults, and 036 defaults email on.
  const { data: prefs } = await adminClient
    .from('notification_preferences')
    .select('email')
    .eq('user_id', recipientId)
    .maybeSingle()

  if (prefs && (prefs as any).email === false) {
    return json({ sent: false, reason: 'email_disabled' }, 200)
  }

  const apiKey = resendKey()
  const fromEmail = emailFrom()
  if (!apiKey || !fromEmail) {
    return json({ sent: false, reason: 'email_not_configured' }, 200)
  }

  const { data: recipient } = await adminClient.auth.admin.getUserById(recipientId)
  const recipientEmail = recipient?.user?.email
  if (!recipientEmail) return json({ sent: false, reason: 'no_recipient_email' }, 200)

  const subject = ((note as any).subject as string | null) || null
  const heading =
    (note as any).kind === 'suspension' ? 'KTIP has suspended something you posted' : 'A note from KTIP'

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject: subject ? `${heading}: ${subject}` : heading,
      html: noteEmailHtml({
        heading,
        subject,
        body: String((note as any).body ?? ''),
        notesUrl: `${siteOrigin(request)}/dashboard/feedback`,
      }),
    }),
  })

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => '')
    return json({ sent: false, reason: `resend_failed ${detail}`.trim() }, 200)
  }

  await adminClient.from('admin_notes').update({ emailed_at: new Date().toISOString() }).eq('id', noteId)

  return json({ sent: true }, 200)
}
