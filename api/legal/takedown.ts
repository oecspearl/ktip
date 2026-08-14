import { createClient } from '@supabase/supabase-js'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'

export const config = { runtime: 'edge' }

/**
 * Files a copyright or trade mark infringement notice.
 *
 * PUBLIC and unauthenticated, which is the constraint the whole design follows
 * from. A rightsholder is usually not a KTIP member — a photographer, a label,
 * a company's lawyer — so this cannot require a JWT, cannot be an RPC (there is
 * no `auth.uid()` to write under), and cannot go through RLS. `takedown_notices`
 * has no INSERT policy at all; this handler holds the service key and is the
 * only door.
 *
 * Three things only a server can do, and all three are why this is an endpoint
 * rather than a direct client write:
 *   - see `x-forwarded-for`, so the caller's IP can be salted and hashed the way
 *     Privacy §2.2 promises rather than stored raw or not at all;
 *   - rate-limit, because an unauthenticated write endpoint that mails people is
 *     an obvious abuse target;
 *   - send the acknowledgement, which needs the Resend key.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Notices per IP per window. Generous for a real complainant, useless for a script. */
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

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

/**
 * Salted SHA-256, matching api/translate.ts. An unset salt is survivable — the
 * hash is still not a raw address — but it makes the values guessable, so it is
 * set in production.
 */
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${process.env.TAKEDOWN_IP_SALT ?? ''}${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function reference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return `TD-${suffix}`
}

/** Truthy-but-not-`true` must not pass for a sworn statement. */
const isSworn = (value: unknown): boolean => value === true

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Server configuration error' }, 503)
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return json({ ok: false, error: 'Invalid request' }, 400)

    const claimantName = String(body.claimant_name ?? '').trim()
    const claimantEmail = String(body.claimant_email ?? '').trim().toLowerCase()
    const claimantOrg = body.claimant_org ? String(body.claimant_org).trim() : null
    const claimantRole = String(body.claimant_role ?? '')
    const targetUrl = String(body.target_url ?? '').trim()
    const workDescription = String(body.work_description ?? '').trim()
    const infringementDetail = String(body.infringement_detail ?? '').trim()

    if (claimantName.length < 2) return json({ ok: false, error: 'A name is required' }, 400)
    if (!EMAIL_RE.test(claimantEmail)) {
      return json({ ok: false, error: 'A valid email address is required' }, 400)
    }
    if (claimantRole !== 'owner' && claimantRole !== 'authorised_agent') {
      return json({ ok: false, error: 'Say whether you are the owner or an authorised agent' }, 400)
    }
    if (!targetUrl) return json({ ok: false, error: 'The address of the content is required' }, 400)
    if (workDescription.length < 10 || infringementDetail.length < 10) {
      return json({ ok: false, error: 'Describe the work and why it infringes' }, 400)
    }
    if (
      !isSworn(body.sworn_good_faith) ||
      !isSworn(body.sworn_accuracy) ||
      !isSworn(body.sworn_authority)
    ) {
      return json({ ok: false, error: 'All three affirmations are required' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const ipHash = await hashIp(clientIp(request))

    // Counted on the hash, so the throttle table never holds an address. A
    // failure here is ignored rather than fatal: losing a genuine notice to a
    // transient database error is worse than serving one over the limit.
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count } = await admin
      .from('takedown_notices')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', since)

    if ((count ?? 0) >= RATE_LIMIT) {
      return json(
        { ok: false, error: 'Too many notices from this address. Email us instead.' },
        429
      )
    }

    const ref = reference()

    const { error } = await admin.from('takedown_notices').insert({
      kind: 'takedown',
      reference: ref,
      claimant_name: claimantName,
      claimant_email: claimantEmail,
      claimant_org: claimantOrg,
      claimant_role: claimantRole,
      // Trusted only as a hint for triage — the values come from a link the
      // claimant followed, and a moderator confirms the target before acting.
      target_type: typeof body.target_type === 'string' && body.target_type ? body.target_type : null,
      target_id: typeof body.target_id === 'string' && body.target_id ? body.target_id : null,
      target_url: targetUrl,
      work_description: workDescription,
      infringement_detail: infringementDetail,
      sworn_good_faith: true,
      sworn_accuracy: true,
      sworn_authority: true,
      status: 'received',
      ip_hash: ipHash,
      user_agent: (request.headers.get('user-agent') ?? '').slice(0, 400) || null,
    })

    if (error) {
      return json({ ok: false, error: 'We could not file your notice. Please try again.' }, 500)
    }

    // The notice is filed from here on. A mail failure is reported as a warning
    // and never as a failure of the filing — the record is what matters, and
    // telling someone their complaint failed when it did not is worse than
    // telling them the receipt is delayed.
    let emailed = false
    const from = emailFrom()
    const key = resendKey()
    if (from && key) {
      const origin = siteOrigin(request)
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: claimantEmail,
            subject: `Infringement notice received — ${ref}`,
            html: `
              <p>Thank you. Your infringement notice has been received.</p>
              <p><strong>Reference:</strong> ${escapeHtml(ref)}</p>
              <p><strong>Content reported:</strong> ${escapeHtml(targetUrl)}</p>
              <p>We will review it and tell you the outcome. If we act on it, the member who
              posted the content is told what was removed, why, and who filed the notice —
              they cannot answer a complaint they cannot see. They may file a counter-notice,
              and we will pass it on to you if they do.</p>
              <p>The full process is at
              <a href="${origin}/legal/copyright">${origin}/legal/copyright</a>.</p>
              <p>Quote your reference in any follow-up.</p>
            `,
          }),
        })
        emailed = response.ok
      } catch {
        emailed = false
      }
    }

    return json({ ok: true, reference: ref, emailed })
  } catch {
    return json({ ok: false, error: 'We could not file your notice. Please try again.' }, 500)
  }
}
