import { createClient } from '@supabase/supabase-js'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'

export const config = { runtime: 'edge' }

/**
 * Emails a collaboration invitation to an address that may not have a KTIP
 * account yet.
 *
 * This is the app's first outbound channel to non-members, so it is
 * deliberately narrow:
 *   - the caller's JWT is verified before anything is written;
 *   - the token is minted here, never accepted from the client;
 *   - the caller must own the resource they are inviting to;
 *   - a per-inviter daily cap limits blast radius if an account is taken over;
 *   - addresses that already belong to a member get an in-app invitation
 *     instead of an email, so we never mail an existing user a signup link.
 */

const DAILY_INVITE_LIMIT = 25
const EXPIRY_DAYS = 14

type ResourceType = 'whiteboard' | 'document' | 'snippet' | 'platform'

const RESOURCE_CONFIG: Record<
  Exclude<ResourceType, 'platform'>,
  { table: string; shareTable: string; fkColumn: string; path: string; label: string }
> = {
  whiteboard: {
    table: 'whiteboards',
    shareTable: 'whiteboard_shares',
    fkColumn: 'whiteboard_id',
    path: 'whiteboard',
    label: 'whiteboard',
  },
  document: {
    table: 'documents',
    shareTable: 'document_shares',
    fkColumn: 'document_id',
    path: 'document',
    label: 'document',
  },
  snippet: {
    table: 'snippets',
    shareTable: 'snippet_shares',
    fkColumn: 'snippet_id',
    path: 'code',
    label: 'code snippet',
  },
}

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

// Exported so the template can be rendered and previewed without going through
// the authenticated handler (which writes an email_invites row as a side effect).
export function inviteEmailHtml(params: {
  inviterName: string
  resourceLabel: string
  resourceTitle: string
  permission: string
  joinUrl: string
}) {
  const { inviterName, resourceLabel, resourceTitle, permission, joinUrl } = params
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">KTIP</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(inviterName)} invited you to collaborate</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
      You've been invited to the ${escapeHtml(resourceLabel)}
      <strong>${escapeHtml(resourceTitle)}</strong> with
      <strong>${permission === 'edit' ? 'edit' : 'view-only'}</strong> access.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Open the link below to accept. If you don't have a KTIP account yet, you'll be able to create one first.
    </p>
    <a href="${joinUrl}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Accept invitation</a>
    <p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">
      This invitation expires in ${EXPIRY_DAYS} days. If you weren't expecting it, you can ignore this email.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${joinUrl}</p>
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
  const resourceType = String(body?.resource_type ?? 'platform') as ResourceType
  const resourceId = body?.resource_id ? String(body.resource_id) : null
  const resourceTitle = String(body?.resource_title ?? '').slice(0, 200)
  const permission = body?.permission === 'edit' ? 'edit' : 'view'

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'Enter a valid email address.' }, 400)
  }
  if (email === caller.email?.toLowerCase()) {
    return json({ error: "That's your own email address." }, 400)
  }
  if (resourceType !== 'platform' && !RESOURCE_CONFIG[resourceType]) {
    return json({ error: 'Unknown resource type.' }, 400)
  }
  if ((resourceType === 'platform') !== (resourceId === null)) {
    return json({ error: 'Resource id does not match the resource type.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // --- Rate limit: cap how many invitations one account can send per day ---
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await admin
    .from('email_invites')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', caller.id)
    .gte('created_at', since)

  if ((recentCount ?? 0) >= DAILY_INVITE_LIMIT) {
    return json(
      { error: `You can send up to ${DAILY_INVITE_LIMIT} email invitations per day.` },
      429
    )
  }

  // --- Authorization: you may only invite to something you own ---
  const config = resourceType === 'platform' ? null : RESOURCE_CONFIG[resourceType]
  let title = resourceTitle
  if (config && resourceId) {
    const { data: resource, error: resourceError } = await admin
      .from(config.table)
      .select('id, title, owner_id')
      .eq('id', resourceId)
      .maybeSingle()

    if (resourceError || !resource) return json({ error: 'Resource not found.' }, 404)
    if ((resource as any).owner_id !== caller.id) {
      return json({ error: 'Only the owner can invite people to this resource.' }, 403)
    }
    title = (resource as any).title || resourceTitle
  }

  // --- Already a member? Share in-app rather than emailing a signup link ---
  const { data: existing } = await admin.rpc('get_user_id_by_email', { p_email: email })
  const existingUserId = typeof existing === 'string' ? existing : null

  if (existingUserId && config && resourceId) {
    // Don't knock an already-accepted collaborator back to pending.
    const { data: existingShare } = await admin
      .from(config.shareTable)
      .select('status')
      .eq(config.fkColumn, resourceId)
      .eq('shared_with', existingUserId)
      .maybeSingle()

    const { error: shareError } = await admin.from(config.shareTable).upsert(
      {
        [config.fkColumn]: resourceId,
        shared_with: existingUserId,
        shared_by: caller.id,
        permission,
        status: (existingShare as any)?.status === 'accepted' ? 'accepted' : 'pending',
      },
      { onConflict: `${config.fkColumn},shared_with` }
    )
    if (shareError) return json({ error: shareError.message }, 400)

    await admin.from('notifications').insert({
      user_id: existingUserId,
      type: 'collab_invite',
      title: 'Collaboration invitation',
      body: `You've been invited to "${title}"`,
      link: '/invitations',
    })

    return json({ success: true, existing_user: true }, 200)
  }

  // --- Mint the token and record the invitation ---
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error: insertError } = await admin.from('email_invites').insert({
    email,
    token,
    invited_by: caller.id,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_title: title || null,
    permission,
    expires_at: expiresAt,
  })
  if (insertError) return json({ error: insertError.message }, 400)

  // --- Send ---
  const apiKey = resendKey()
  const fromEmail = emailFrom()
  if (!apiKey || !fromEmail) {
    // The invite row exists and the link works; only delivery is unconfigured.
    return json(
      {
        error:
          'Email delivery is not configured yet. Ask an administrator to set RESEND_API_KEY and EMAIL_FROM.',
      },
      503
    )
  }

  const { data: inviterProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', caller.id)
    .maybeSingle()

  const inviterName =
    (inviterProfile as any)?.display_name || caller.email?.split('@')[0] || 'A KTIP member'
  const joinUrl = `${siteOrigin(request)}/join/${token}`

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: `${inviterName} invited you to collaborate on KTIP`,
      html: inviteEmailHtml({
        inviterName,
        resourceLabel: config?.label ?? 'KTIP workspace',
        resourceTitle: title || 'KTIP',
        permission,
        joinUrl,
      }),
    }),
  })

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => '')
    // Withdraw the invite rather than leaving a live token nobody received.
    await admin.from('email_invites').update({ status: 'revoked' }).eq('token', token)
    return json({ error: `Failed to send the invitation email. ${detail}`.trim() }, 502)
  }

  return json({ success: true, existing_user: false }, 200)
}
