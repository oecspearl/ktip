import { requirePermission } from '../_lib/require-permission'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Suspend or reinstate an account from the admin console (124, 184).
 *
 * set_user_suspension() is called AS THE CALLER. That RPC is where the rules
 * live — moderation:escalate to call it at all, the Super Admin ceiling for
 * Admin targets, no self-suspension, no suspending the Super Admin — and it
 * refuses with a reason rather than raising. Nothing here re-implements those
 * rules; if the RPC says no, this route says no. Since 184 it also writes the
 * moderation_log row.
 *
 * Suspending no longer bans the login (184). has_permission() already refuses
 * every action to a suspended account, and a ban only meant the member could
 * not sign in to read why or to appeal. The client now holds a suspended
 * session on /account/suspended instead (MainLayout, ProtectedRoute).
 *
 * Reinstating still clears any ban, with the service key, so an account banned
 * by the old behaviour (or by hand in the dashboard) can sign in again. It runs
 * only after the RPC has succeeded. scripts/unban-suspended.mjs clears the bans
 * the old behaviour left on accounts that are still suspended.
 *
 * Gated on members:manage like the rest of api/admin/*. The RPC then asks for
 * moderation:escalate; both administrators hold both.
 */

const REASONS: Record<string, string> = {
  forbidden: 'You do not have permission to suspend accounts.',
  not_found: 'No such account.',
  cannot_suspend_self: 'You cannot suspend your own account.',
  super_admin_protected: 'The Super Admin account cannot be suspended.',
  seat_requires_super_admin: 'Only a Super Admin can suspend an Admin.',
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'members:manage')
  if (!guard.ok) return guard.response
  const { adminClient, callerClient } = guard

  let body: { user_id?: string; suspended?: boolean; reason?: string; until?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const userId = String(body.user_id ?? '')
  if (!userId) return json({ error: 'user_id is required' }, 400)
  if (typeof body.suspended !== 'boolean') return json({ error: 'suspended must be true or false' }, 400)

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null
  const until = typeof body.until === 'string' && !Number.isNaN(Date.parse(body.until)) ? body.until : null

  const { data, error } = await callerClient.rpc('set_user_suspension', {
    p_user: userId,
    p_suspended: body.suspended,
    p_until: until,
    p_reason: reason,
  })
  if (error) return json({ error: error.message }, 400)
  if (data && data.ok === false) {
    const code = String(data.reason ?? '')
    return json({ error: REASONS[code] || 'Could not update the suspension.', reason: code }, 403)
  }

  // Suspending stops here: the member signs in and lands on the suspended page.
  if (body.suspended) return json({ success: true }, 200)

  // Reinstating clears any ban left by the old behaviour.
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: 'none',
  })
  if (banError) {
    // The profile row is already correct, so the account can act again once
    // it is signed in. What may remain is an old sign-in block — say so.
    return json(
      {
        success: true,
        warning: 'The suspension was lifted but an old sign-in block could not be removed. Try again.',
      },
      200
    )
  }

  return json({ success: true }, 200)
}
