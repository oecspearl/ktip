import { createClient } from '@supabase/supabase-js'
import { consumeRateLimit } from './_lib/require-permission'

export const config = { runtime: 'edge' }

/**
 * Self-service account deletion (GDPR right-to-deletion), the immediate path.
 * Deletes the caller's profile row and removes the auth user via service role.
 * The 7-day path is close_my_account('delete') (140/141).
 *
 * Irreversible, so three checks run first (2026-11-10):
 *   - the caller's second step, when their role requires one: a stolen
 *     password-only session must not be able to erase the account. Asked
 *     through the caller's client so account_mfa_satisfied() sees this session.
 *   - an administrator seat is closed by another administrator, never by
 *     itself, the same rule close_my_account() applies (141).
 *   - three attempts a day per account.
 * Errors from the database or GoTrue are logged, not returned.
 */
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
    return json({ error: 'Server configuration error' }, 503)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(supabaseUrl, supabaseServiceKey)

  if (!(await consumeRateLimit(adminClient, `delete-account:user:${caller.id}`, 86_400, 3))) {
    return json({ error: 'Too many attempts. Please try again tomorrow.' }, 429)
  }

  const [{ data: satisfied, error: mfaError }, { data: seat, error: seatError }] = await Promise.all([
    callerClient.rpc('account_mfa_satisfied', { p_user: caller.id }),
    callerClient.rpc('holds_admin_seat', { p_user: caller.id }),
  ])
  if (mfaError || seatError) {
    console.error(`[delete-account] pre-checks failed: ${(mfaError ?? seatError)?.message}`)
    return json({ error: 'Account deletion failed. Please try again.' }, 500)
  }
  if (satisfied !== true) {
    return json(
      { error: 'Confirm your second sign-in step, then try again.', code: 'step_up_required' },
      403
    )
  }
  if (seat === true) {
    return json(
      { error: 'An administrator account is closed by another administrator, not by itself.' },
      403
    )
  }

  // Remove profile row first (FK'd content cascades per table definitions)
  const { error: profileError } = await adminClient
    .from('profiles')
    .delete()
    .eq('id', caller.id)

  if (profileError) {
    console.error(`[delete-account] profile delete failed: ${profileError.message}`)
    return json({ error: 'Account deletion failed. Please try again.' }, 500)
  }

  const { error: authError } = await adminClient.auth.admin.deleteUser(caller.id)

  if (authError) {
    console.error(`[delete-account] auth delete failed: ${authError.message}`)
    return json({ error: 'Account deletion failed. Please try again.' }, 500)
  }

  return json({ success: true }, 200)
}
