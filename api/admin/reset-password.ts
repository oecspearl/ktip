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

  let body: { user_id: string; new_password: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.user_id || !body.new_password) {
    return new Response(
      JSON.stringify({ error: 'user_id and new_password are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (body.new_password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Password must be at least 8 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // The Super Admin ceiling (124). Setting another Admin's password is a
  // takeover of their account, and only the Super Admin may do it.
  const ceiling = await requireCanAdminister(callerClient, body.user_id)
  if (ceiling) return ceiling

  const { error } = await adminClient.auth.admin.updateUserById(body.user_id, {
    password: body.new_password,
  })

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
