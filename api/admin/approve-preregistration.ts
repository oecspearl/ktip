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
  const { callerId, adminClient } = guard

  let body: { preregistration_id: string; password: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.preregistration_id || !body.password) {
    return new Response(
      JSON.stringify({ error: 'preregistration_id and password are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (body.password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Password must be at least 8 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }


  // Fetch the pre-registration
  const { data: prereg, error: preregError } = await adminClient
    .from('preregistrations')
    .select('*')
    .eq('id', body.preregistration_id)
    .single()

  if (preregError || !prereg) {
    return new Response(
      JSON.stringify({ error: 'Pre-registration not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (prereg.status === 'approved') {
    return new Response(
      JSON.stringify({ error: 'This application has already been approved' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Create the user account
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: prereg.email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      display_name: prereg.display_name,
    },
  })

  if (createError) {
    return new Response(
      JSON.stringify({ error: createError.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Update the profile with pre-registration data
  if (newUser.user) {
    await adminClient.from('profiles').update({
      display_name: prereg.display_name,
      bio: prereg.bio || null,
      country: prereg.country || null,
      roles: [prereg.role],
      skills: prereg.skills || [],
    } as any).eq('id', newUser.user.id)
  }

  // Mark pre-registration as approved
  await adminClient.from('preregistrations').update({
    status: 'approved',
    reviewed_by: callerId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', body.preregistration_id)

  return new Response(
    JSON.stringify({ success: true, user: { id: newUser.user?.id, email: newUser.user?.email } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
