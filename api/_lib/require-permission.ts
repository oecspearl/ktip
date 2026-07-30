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

export interface AuthorizeSuccess {
  ok: true
  callerId: string
  callerClient: SupabaseClient
}

export type AuthorizeResult = AuthorizeSuccess | GuardFailure

/**
 * Authorises the caller without minting a service-role client.
 *
 * Use this for routes that read no user data through Supabase — the Sentry
 * proxy only needs to know *who is asking*, so handing it a key that bypasses
 * RLS would be an unnecessary blast radius. `requirePermission` builds on this
 * and adds the elevated client for the routes that genuinely need one.
 */
export async function authorize(
  request: Request,
  permission: string
): Promise<AuthorizeResult> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  // Current `sb_publishable_…` key first, legacy anon JWT as fallback.
  const anonKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
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

  return { ok: true, callerId: caller.id, callerClient }
}

export async function requirePermission(
  request: Request,
  permission: string
): Promise<GuardResult> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  // `sb_secret_…` is the current elevated key; SUPABASE_SERVICE_ROLE_KEY is the
  // deprecated legacy JWT, kept only so a deployment that still sets the old
  // variable does not start returning 503 the moment this ships. Drop the
  // fallback here and in the other api/ handlers once every environment is
  // migrated. Either way this key bypasses RLS — never send it to the browser.
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  // Checked before authorising, so a deployment missing the key fails as a
  // configuration error rather than a permission error.
  if (!supabaseUrl || !supabaseServiceKey) {
    return { ok: false, response: json({ error: 'Server configuration error' }, 503) }
  }

  const result = await authorize(request, permission)
  if (!result.ok) return result

  return {
    ok: true,
    callerId: result.callerId,
    callerClient: result.callerClient,
    adminClient: createClient(supabaseUrl, supabaseServiceKey),
  }
}
