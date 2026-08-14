import { requirePermission } from '../_lib/require-permission'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Clear a member's second factor (118) — the answer to "I lost my phone and my
 * recovery codes".
 *
 * Gated on members:manage, the same key api/admin/reset-password.ts uses and
 * described in the catalog as "create, edit, suspend and delete user accounts".
 * Wiping someone's authentication is squarely that, and inventing a new key for
 * it would only mean two keys that have to be kept in step. super_admin holds
 * it; safety_admin does not, which is the right split — moderation staff have no
 * business resetting authentication.
 *
 * The audit row is not optional. An administrator who can silently strip anyone's
 * second factor with no trace is a worse hole than the one MFA closes.
 */

async function listFactors(url: string, key: string, userId: string) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}/factors`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return []
  // Bare array or { factors: [...] } envelope, depending on GoTrue version.
  const body: any = await res.json().catch(() => [])
  const factors = Array.isArray(body) ? body : (body?.factors ?? [])
  return factors as { id: string }[]
}

async function deleteFactor(url: string, key: string, userId: string, factorId: string) {
  await fetch(`${url}/auth/v1/admin/users/${userId}/factors/${factorId}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'members:manage')
  if (!guard.ok) return guard.response
  const { adminClient, callerId } = guard

  const supabaseUrl = process.env.VITE_SUPABASE_URL as string
  const serviceKey = (process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY) as string

  let body: { user_id?: string; note?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const userId = String(body.user_id ?? '')
  if (!userId) return json({ error: 'user_id is required' }, 400)

  // Factors and codes go together. Leaving the recovery codes behind would let
  // whoever holds that sheet enrol a factor of their own on an account the
  // administrator has just been told is compromised.
  const factors = await listFactors(supabaseUrl, serviceKey, userId)
  for (const factor of factors) {
    await deleteFactor(supabaseUrl, serviceKey, userId, factor.id)
  }
  await adminClient.from('mfa_backup_codes').delete().eq('user_id', userId)

  await adminClient.rpc('sync_mfa_status', { p_user: userId }).then(
    () => {},
    () => {},
  )

  const { error: auditError } = await adminClient.from('mfa_admin_events').insert({
    actor_id: callerId,
    target_id: userId,
    action: 'admin_reset',
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
  })
  if (auditError) {
    // Reported rather than swallowed: the reset has happened, and an operator
    // needs to know the trail is broken so it can be recorded another way.
    return json(
      { success: true, warning: 'The reset succeeded but the audit entry failed to write.' },
      200,
    )
  }

  // Direct insert, not send_notification(): that RPC drops a notification whose
  // recipient is the caller and raises without a JWT subject, and here the
  // recipient is a third party being told about something done to them.
  await adminClient
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'security',
      title: 'Two-step verification was reset on your account',
      body: 'A KTIP administrator cleared your authenticator app. Set up a new one the next time you sign in.',
      link: '/settings',
    })
    .then(
      () => {},
      () => {},
    )

  return json({ success: true, cleared: factors.length }, 200)
}
