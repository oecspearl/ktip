import { createClient } from '@supabase/supabase-js'
import { enrollInKtipCourse, KtipEnrollError } from '../_lib/ktip-catalog'

export const config = { runtime: 'edge' }

/**
 * Enrolls the signed-in KTIP user into a Virtual Campus course — the
 * "Enroll" button on the /resources?tab=courses Courses tab.
 *
 * The email enrolled is always the caller's own, resolved server-side via
 * auth.getUser(). The request body only ever accepts a course_id: if it also
 * accepted an email, any signed-in user could enroll an arbitrary address in
 * a course, turning this into an open mailer for the Virtual Campus.
 */

const IP_LIMIT = 20
const IP_WINDOW = 900

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

function clientIp(request: Request): string {
  const raw =
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-vercel-forwarded-for') || '').split(',')[0].trim() ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  if (!raw) return 'unknown'
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':')
  return raw
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !serviceKey || !anonKey || !process.env.MYPD_KTIP_API_KEY) {
    return json({ error: 'Server configuration error' }, 503)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()
  if (!caller?.email) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `ktip-enroll:user:${caller.id}`,
    p_window_seconds: IP_WINDOW,
    p_limit: IP_LIMIT,
  })
  if ((limit as { allowed?: boolean } | null)?.allowed === false) {
    return json({ error: 'Too many enrollment attempts. Please try again later.' }, 429)
  }

  let body: { course_id?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }
  if (!body.course_id || typeof body.course_id !== 'string') {
    return json({ error: 'course_id is required' }, 400)
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', caller.id)
    .maybeSingle()

  try {
    const result = await enrollInKtipCourse({
      email: caller.email,
      course_id: body.course_id,
      name: (profile?.display_name as string) || null,
    })
    return json(result, 200)
  } catch (err) {
    if (err instanceof KtipEnrollError) {
      if (err.status === 403) {
        return json({ error: 'This course is not currently open for KTIP enrollment.' }, 403)
      }
      if (err.status === 404) {
        return json({ error: 'Course not found — it may have been removed.' }, 404)
      }
      if (err.status === 401 || err.status === 503) {
        console.error(`[ktip-enroll] upstream auth/config error: ${err.message}`)
        return json({ error: 'Server misconfigured; contact support.' }, 500)
      }
      return json({ error: err.message }, 502)
    }
    return json({ error: 'Enrollment failed' }, 502)
  }
}
