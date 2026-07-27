import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

/**
 * Self-service account deletion (GDPR right-to-deletion).
 * Deletes the caller's profile row and removes the auth user via service role.
 */
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

  const adminClient = createClient(supabaseUrl, supabaseServiceKey)

  // Remove profile row first (FK'd content cascades per table definitions)
  const { error: profileError } = await adminClient
    .from('profiles')
    .delete()
    .eq('id', caller.id)

  if (profileError) {
    return new Response(
      JSON.stringify({ error: profileError.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { error: authError } = await adminClient.auth.admin.deleteUser(caller.id)

  if (authError) {
    return new Response(
      JSON.stringify({ error: authError.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
