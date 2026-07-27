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

  // Check admin role
  const { data: profile } = await callerClient.from('profiles').select('roles').eq('id', caller.id).single()
  if (!profile?.roles?.includes('oecs')) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

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
  const adminClient = createClient(supabaseUrl, supabaseServiceKey)

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
