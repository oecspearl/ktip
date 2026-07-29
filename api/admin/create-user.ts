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
  const { adminClient } = guard

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

  // Update profile with roles if provided
  if (body.roles && body.roles.length > 0 && data.user) {
    await adminClient.from('profiles').update({ roles: body.roles } as any).eq('id', data.user.id)
  }

  // Update display_name in profiles if provided
  if (body.display_name && data.user) {
    await adminClient.from('profiles').update({ display_name: body.display_name }).eq('id', data.user.id)
  }

  return new Response(
    JSON.stringify({ user: { id: data.user?.id, email: data.user?.email } }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  )
}
