import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared guard for the privileged edge routes.
 *
 * Every handler under api/admin/ carried its own copy of this block, each one
 * hard-coding `roles.includes('oecs')`. That meant the server-side rule and the
 * database rule could drift, and a new role could never be admitted without
 * editing five files. Both now resolve through the same has_permission()
 * function that RLS uses.
 */

export interface GuardSuccess {
  ok: true
  callerId: string
  callerClient: SupabaseClient
  adminClient: SupabaseClient
}

export interface GuardFailure {
  ok: false
  response: Response
}

export type GuardResult = GuardSuccess | GuardFailure

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function requirePermission(
  request: Request,
  permission: string
): Promise<GuardResult> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
    return { ok: false, response: json({ error: 'Server configuration error' }, 503) }
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, response: json({ error: 'Unauthorized' }, 401) }
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()

  if (!caller) {
    return { ok: false, response: json({ error: 'Unauthorized' }, 401) }
  }

  // Evaluated by the database, so a matrix change takes effect here without a
  // redeploy — and a suspended admin loses access immediately.
  const { data: allowed, error } = await callerClient.rpc('has_permission', {
    p_user: caller.id,
    p_permission: permission,
  })

  if (error || allowed !== true) {
    return {
      ok: false,
      response: json({ error: `Forbidden: ${permission} required` }, 403),
    }
  }

  return {
    ok: true,
    callerId: caller.id,
    callerClient,
    adminClient: createClient(supabaseUrl, supabaseServiceKey),
  }
}
