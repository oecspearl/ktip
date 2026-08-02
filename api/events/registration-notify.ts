import { createClient } from '@supabase/supabase-js'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'

export const config = { runtime: 'edge' }

/**
 * Emails the organizer that someone has registered for their event and is
 * waiting on a decision.
 *
 * The in-app notification (send_notification) is the primary channel; this is
 * the one that reaches an organizer who is not in the app, which is exactly the
 * case that went unnoticed and prompted the whole approval flow.
 *
 * Deliberately narrow:
 *   - the caller's JWT is verified before anything is read;
 *   - the caller may only announce their OWN pending registration — the row is
 *     looked up by (event_id, caller.id), so an event id is not enough to make
 *     this fire, and there is nothing to enumerate;
 *   - the organizer's address is resolved server-side from auth.users and never
 *     returned to the browser;
 *   - unconfigured delivery is a 200 with sent:false, not an error. The
 *     registration already succeeded; a missing RESEND_API_KEY must not make a
 *     successful registration look like a failed one.
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

function registrationEmailHtml(params: {
  registrantName: string
  eventTitle: string
  attendanceType: string
  reviewUrl: string
}) {
  const { registrantName, eventTitle, attendanceType, reviewUrl } = params
  const how = attendanceType === 'viewer' ? 'viewer' : 'participant'

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">KTIP</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">A registration is waiting on you</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(registrantName)}</strong> wants to attend
      <strong>${escapeHtml(eventTitle)}</strong> as a <strong>${how}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      They are not registered until you approve it, and they cannot enter the venue in the meantime.
    </p>
    <a href="${reviewUrl}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Review the registration</a>
    <p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">
      You are getting this because you organize this event.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${reviewUrl}</p>
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
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const eventId = body?.event_id ? String(body.event_id) : null
  if (!eventId) return json({ error: 'event_id is required' }, 400)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // The caller's own row, or nothing. This is what makes the endpoint safe to
  // expose: it can only ever announce a registration the caller just made.
  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('id, status, attendance_type')
    .eq('event_id', eventId)
    .eq('user_id', caller.id)
    .maybeSingle()

  if (!rsvp) return json({ error: 'No registration found' }, 404)
  if ((rsvp as any).status !== 'pending') {
    // Nothing to decide, so nothing to chase the organizer about.
    return json({ sent: false, reason: 'not_pending' }, 200)
  }

  const { data: event } = await admin
    .from('events')
    .select('id, title, organizer_id')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return json({ error: 'Event not found' }, 404)

  const apiKey = resendKey()
  const fromEmail = emailFrom()
  if (!apiKey || !fromEmail) {
    // The registration and the in-app notification both landed. Only delivery
    // is unconfigured, and that is not the registrant's problem.
    return json({ sent: false, reason: 'email_not_configured' }, 200)
  }

  const { data: organizer } = await admin.auth.admin.getUserById((event as any).organizer_id)
  const organizerEmail = organizer?.user?.email
  if (!organizerEmail) return json({ sent: false, reason: 'no_organizer_email' }, 200)

  const { data: registrantProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', caller.id)
    .maybeSingle()

  const registrantName =
    (registrantProfile as any)?.display_name || caller.email?.split('@')[0] || 'A KTIP member'

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [organizerEmail],
      subject: `${registrantName} registered for ${(event as any).title}`,
      html: registrationEmailHtml({
        registrantName,
        eventTitle: (event as any).title,
        attendanceType: (rsvp as any).attendance_type,
        reviewUrl: `${siteOrigin(request)}/invitations`,
      }),
    }),
  })

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => '')
    return json({ sent: false, reason: `resend_failed ${detail}`.trim() }, 200)
  }

  return json({ sent: true }, 200)
}
