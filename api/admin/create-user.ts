import { requirePermission } from '../_lib/require-permission'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const guard = await requirePermission(request, 'members:manage')
  if (!guard.ok) return guard.response
  const { adminClient, callerClient } = guard

  // Parse request body
  let body: { email: string; password: string; display_name?: string; roles?: string[] }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.email || !body.password) {
    return new Response(
      JSON.stringify({ error: 'email and password are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (body.password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Password must be at least 8 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Create user with service role

  const { data, error } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      display_name: body.display_name || body.email.split('@')[0],
    },
  })

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Roles go through set_user_roles() as the CALLER, not through a service-key
  // UPDATE. The service key bypasses the profile guard, which meant anyone with
  // members:manage could create an account that was born super_admin. The RPC
  // asks for role:manage and applies the Super Admin ceiling (124): an Admin can
  // create members and supervisors, not Admins. The account already exists at this
  // point, so a refusal is reported alongside the id rather than rolled back.
  let roleWarning: string | undefined
  if (body.roles && body.roles.length > 0 && data.user) {
    const { data: result, error: roleError } = await callerClient.rpc('set_user_roles', {
      p_user: data.user.id,
      p_roles: body.roles,
    })
    const reason = roleError ? roleError.message : result?.ok === false ? String(result.reason) : null
    if (reason) {
      roleWarning =
        reason === 'seat_requires_super_admin'
          ? 'The account was created without roles: only a Super Admin can grant the Admin or Super Admin role.'
          : reason === 'forbidden'
            ? 'The account was created without roles: you do not hold role:manage.'
            : `The account was created, but its roles could not be set (${reason}).`
    }
  }

  // Update display_name in profiles if provided
  if (body.display_name && data.user) {
    await adminClient.from('profiles').update({ display_name: body.display_name }).eq('id', data.user.id)
  }

  return new Response(
    JSON.stringify({ user: { id: data.user?.id, email: data.user?.email }, warning: roleWarning }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  )
}
