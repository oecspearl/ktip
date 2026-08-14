import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Spend a recovery code and clear the lost authenticator (118).
 *
 * This route exists because the two halves need different privileges. Spending
 * the code is the caller's own business and goes through
 * consume_mfa_backup_code() on their session; deleting the factor is a
 * service-role operation, because an aal1 session cannot remove the very factor
 * it is failing to satisfy.
 *
 * What the caller gets is deliberately small: the factor is gone, so
 * requires_mfa_enrollment flips back to TRUE and the gate routes them to enrol
 * again. A code never promotes a session to aal2 — GoTrue owns that claim, and
 * a second factor the application can talk itself past is not a second factor.
 */

/**
 * GoTrue admin factor endpoints, called over REST rather than through
 * supabase-js. `auth.admin.mfa.deleteFactor` is marked @experimental in
 * auth-js, and this is a recovery path — it is the last thing that should break
 * on a minor SDK bump. The REST shape is what the SDK wraps anyway.
 */
async function listFactors(url: string, key: string, userId: string) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}/factors`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return []
  // GoTrue has returned both a bare array and a { factors: [...] } envelope
  // across versions, and this is a recovery path — accept either.
  const body: any = await res.json().catch(() => [])
  const factors = Array.isArray(body) ? body : (body?.factors ?? [])
  return factors as { id: string; status: string; factor_type: string }[]
}

async function deleteFactor(url: string, key: string, userId: string, factorId: string) {
  await fetch(`${url}/auth/v1/admin/users/${userId}/factors/${factorId}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
}

/**
 * Best-effort; a failed notification must never fail the recovery itself.
 *
 * Inserted directly rather than through send_notification() (036), which is
 * wrong here twice over: it raises when auth.uid() is NULL, and the service role
 * has no JWT subject; and it drops self-notifications, which is exactly what
 * this is. The service role bypasses RLS, and the preference trigger on the
 * table still applies.
 */
async function notify(admin: SupabaseClient, userId: string) {
  try {
    await admin.from('notifications').insert({
      user_id: userId,
      type: 'security',
      title: 'A recovery code was used on your account',
      body:
        'Your authenticator app was removed and you were asked to set up a new one. ' +
        'If this was not you, change your password and contact KTIP support.',
      link: '/settings',
    })
  } catch {
    /* ignore */
  }
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

  const code = String(body?.code ?? '')
  if (!code) return json({ error: 'A recovery code is required.' }, 400)

  // Spent on the CALLER's session, so the RPC's auth.uid() is the account being
  // recovered and no user id has to be trusted from the request body. The rate
  // limiting lives inside that function.
  const { data, error } = await callerClient.rpc('consume_mfa_backup_code', { p_code: code })
  if (error) return json({ error: 'That code was not accepted.' }, 400)

  const result = data as { ok?: boolean; reason?: string; remaining?: number } | null
  if (result?.ok !== true) {
    if (result?.reason === 'rate_limited') {
      return json({ error: 'Too many attempts. Wait a while and try again.' }, 429)
    }
    // Deliberately vague, and identical for "wrong" and "already used": a
    // distinguishable response turns this into an oracle for which codes exist.
    return json({ error: 'That code was not accepted.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const factors = await listFactors(supabaseUrl, serviceKey, caller.id)
  for (const factor of factors) {
    await deleteFactor(supabaseUrl, serviceKey, caller.id, factor.id)
  }

  // The derived column is stale the moment the factors go, and the member is
  // about to be routed off this response — so it is corrected here rather than
  // waiting for their next sign-in.
  await admin.rpc('sync_mfa_status', { p_user: caller.id }).then(
    () => {},
    () => {},
  )

  // The audit row and the notification are both "somebody used a recovery code
  // on this account", and the account holder is entitled to learn about it even
  // — especially — if it was not them.
  await admin
    .from('mfa_admin_events')
    .insert({ actor_id: caller.id, target_id: caller.id, action: 'recovery_code_used' })
    .then(
      () => {},
      () => {},
    )
  await notify(admin, caller.id)

  return json({ ok: true, remaining: result.remaining ?? 0 }, 200)
}
