import { createClient } from '@supabase/supabase-js'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'
import {
  PROOF_DAILY_SEND_LIMIT,
  PROOF_TOKEN_TTL_HOURS,
  mintProofToken,
  proofEmailHtml,
} from '../_lib/email-proof'

export const config = { runtime: 'edge' }

/**
 * Starts a proof that the caller controls a work or school mailbox (145).
 *
 * Ownership of the ACCOUNT is the caller's JWT; ownership of the ADDRESS is
 * the mailed token, consumed by confirm-proof. Shape follows add-alias:
 *
 *   - the token is minted here, never accepted from the client;
 *   - the domain is classified BEFORE anything is written or sent, so an
 *     address at an unknown domain costs no row and no mail — and the answer
 *     tells the member to use the document upload instead;
 *   - the primary address is refused here: it is already proven by Supabase's
 *     confirmation, and the client is told to call the RPC instead;
 *   - a daily cap limits blast radius if an account is taken over.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    // Already proven by Supabase. The client calls claim_email_verification().
    return json({ error: 'use_primary' }, 409)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // --- Classify first: no mail for an address nothing would recognise ---
  const { data: kind, error: classifyError } = await admin.rpc('classify_verification_email', {
    p_email: email,
  })
  if (classifyError) return json({ error: 'server_error' }, 500)
  if (kind !== 'trusted' && kind !== 'institution' && kind !== 'roster') {
    return json({ error: 'domain_not_recognised', domain: email.split('@')[1] }, 400)
  }

  // --- Rate limit: cap proof mail per account per day ---
  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `proof-send:user:${caller.id}`,
    p_window_seconds: 86400,
    p_limit: PROOF_DAILY_SEND_LIMIT,
  })
  if (limit && (limit as any).allowed === false) {
    return json(
      { error: `You can request up to ${PROOF_DAILY_SEND_LIMIT} confirmation emails per day.` },
      429
    )
  }

  // --- What does the caller already have for this address? ---
  const { data: mine } = await admin
    .from('email_proofs')
    .select('id, verified_at, send_count')
    .eq('user_id', caller.id)
    .eq('email', email)
    .maybeSingle()

  const mineRow = mine as { id: string; verified_at: string | null; send_count: number } | null

  if (mineRow?.verified_at) {
    // Already proven. Re-run the decision rather than re-mailing: a domain
    // may have been trusted since, or an institution may have opted in.
    const { data: result } = await admin.rpc('apply_verified_email', {
      p_user: caller.id,
      p_email: email,
      p_source: 'proof',
    })
    return json({ success: true, already_verified: true, result }, 200)
  }

  const token = mintProofToken()
  const expiresAt = new Date(Date.now() + PROOF_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString()

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
    ? await admin.from('email_proofs').update(row).eq('id', mineRow.id)
    : await admin.from('email_proofs').insert(row)

  if (writeError) return json({ error: writeError.message }, 400)

  const verifyUrl = `${siteOrigin(request)}/verify-institution-email/${token}`

  const withdraw = () =>
    admin
      .from('email_proofs')
      .update({ verification_token: null, token_expires_at: null })
      .eq('user_id', caller.id)
      .eq('email', email)

  // --- Send ---
  const apiKey = resendKey()
  const fromEmail = emailFrom()
  if (!apiKey || !fromEmail) {
    // Outside production, hand the link back so the flow is testable without
    // Resend. Gated on VERCEL_ENV so a production misconfiguration can never
    // emit a live token into a response body or the logs.
    if (process.env.VERCEL_ENV !== 'production') {
      console.log(`[send-proof] confirmation link (dev only): ${verifyUrl}`)
      return json({ success: true, kind, dev_link: verifyUrl }, 200)
    }
    await withdraw()
    return json(
      {
        error:
          'Email delivery is not configured yet. Ask an administrator to set RESEND_API_KEY and EMAIL_FROM.',
      },
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
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'Confirm your work or school email for KTIP',
      html: proofEmailHtml({ requesterName, verifyUrl, kind }),
    }),
  })

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => '')
    await withdraw()
    return json({ error: `Failed to send the confirmation email. ${detail}`.trim() }, 502)
  }

  return json({ success: true, kind }, 200)
}
