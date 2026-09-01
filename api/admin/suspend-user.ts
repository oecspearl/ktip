import { requirePermission } from '../_lib/require-permission'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Suspend or reinstate an account from the admin console (124).
 *
 * Two things happen, and the order matters.
 *
 * 1. set_user_suspension() is called AS THE CALLER. That RPC is where the
 *    rules live — moderation:escalate to call it at all, the Super Admin
 *    ceiling for Admin targets, no self-suspension, no suspending the Super
 *    Admin — and it refuses with a reason rather than raising. Nothing
 *    here re-implements those rules; if the RPC says no, this route says no.
 *
 * 2. Only once the profile row says suspended is the auth user banned, with the
 *    service key. Suspension on its own is enforced in SQL — has_permission()
 *    returns FALSE for everything, so the account can still open the site and
 *    do nothing. The ban is what "cannot log in" actually means: GoTrue refuses
 *    the password grant and every token refresh. An access token already in a
 *    browser stays valid until it expires (an hour at most), inert the whole
 *    time because the profile row is already suspended.
 *
 * Reinstating reverses both. The ban is lifted only after the RPC has
 * succeeded, so a refusal never leaves an account suspended-but-loginable or
 * the reverse.
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

// Effectively permanent. GoTrue has no "until further notice"; a century is the
// same thing spelled as a duration.
const BAN_INDEFINITE = '876000h'

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'members:manage')
  if (!guard.ok) return guard.response
  const { adminClient, callerClient } = guard

  let body: { user_id?: string; suspended?: boolean; reason?: string; until?: string }
  try {
    body = await request.json()
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

  // The ban follows the row. A timed suspension bans for the same window.
  let banDuration = 'none'
  if (body.suspended) {
    if (until) {
      const hours = Math.ceil((Date.parse(until) - Date.now()) / 3_600_000)
      banDuration = hours > 0 ? `${hours}h` : 'none'
    } else {
      banDuration = BAN_INDEFINITE
    }
  }

  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: banDuration,
  })
  if (banError) {
    // The profile row is already correct, so the account is inert either way.
    // What is missing is the login refusal — say so, rather than pretend.
    return json(
      {
        success: true,
        warning: body.suspended
          ? 'The account is suspended but could not be blocked from signing in. Try again.'
          : 'The suspension was lifted but the sign-in block could not be removed. Try again.',
      },
      200
    )
  }

  return json({ success: true }, 200)
}
