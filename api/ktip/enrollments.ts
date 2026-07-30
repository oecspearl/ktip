import { createClient } from '@supabase/supabase-js'
import { ktipApiKey, KtipEnrollError, loadKtipEnrollments } from '../_lib/ktip-catalog'

export const config = { runtime: 'edge' }

/**
 * Lists the signed-in user's active Virtual Campus KTIP enrollments.
 *
 * Email is resolved server-side via auth.getUser() — the client cannot name
 * an arbitrary address to probe someone else's course history.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey || !ktipApiKey()) {
      return json({ error: 'Server configuration error' }, 503)
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
      error: authError,
    } = await callerClient.auth.getUser()
    if (authError || !caller?.email) return json({ error: 'Unauthorized' }, 401)

    try {
      const enrollments = await loadKtipEnrollments(caller.email)
      return json({ enrollments }, 200)
    } catch (err) {
      if (err instanceof KtipEnrollError) {
        if (err.status === 401 || err.status === 503) {
          return json({ error: 'Enrollment service is not configured correctly. Contact support.' }, 503)
        }
        console.error(`[ktip-enrollments] upstream ${err.status}: ${err.message}`)
        return json({ error: err.message }, 502)
      }
      console.error('[ktip-enrollments] unexpected error:', err)
      return json({ error: 'Could not load enrollments' }, 502)
    }
  } catch (err) {
    console.error('[ktip-enrollments] handler error:', err)
    return json({ error: 'Could not load enrollments' }, 500)
  }
}
