import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Verify caller is authenticated admin
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const anonKey = process.env.VITE_SUPABASE_ANON_KEY!
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: profile } = await callerClient.from('profiles').select('roles').eq('id', caller.id).single()
  if (!profile?.roles?.includes('oecs')) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

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

  const adminClient = createClient(supabaseUrl, supabaseServiceKey)

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
    reviewed_by: caller.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', body.preregistration_id)

  return new Response(
    JSON.stringify({ success: true, user: { id: newUser.user?.id, email: newUser.user?.email } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
