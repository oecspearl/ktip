import { createClient } from '@supabase/supabase-js'
import { loadCatalog, loadEnrollments } from '../_lib/vc-catalog'
import { buildResumeData, mergeResume } from '../_lib/cv-build'
import { RESUME_PATHS, type ResumeData, type ResumeSources } from '../../src/types/resume'

export const config = { runtime: 'edge' }

/**
 * Refreshes a CV from the Virtual Campus — the "Sync from Virtual Campus"
 * button on /cv.
 *
 * The learner's course history keeps moving after the first sign-in: they
 * finish a module, enrol in another. Rather than making them sign in through
 * the campus again to pick that up, this route re-reads their enrollments and
 * folds them into the stored document.
 *
 * Authorisation is deliberately plain "are you signed in": the route only ever
 * touches the caller's own row, and there is no permission in the 063 matrix
 * that describes "may refresh my own CV". Which email to look up comes from
 * vc_my_identity(), scoped to auth.uid() in SQL — the client cannot name an
 * address and have the campus queried for it, which would turn this into a
 * course-history oracle over every learner in the region.
 *
 * The merge policy in cv-build.ts is what makes this safe to press repeatedly:
 * anything the user has edited by hand is left alone.
 */

const IP_LIMIT = 10
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !serviceKey || !anonKey) {
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
  if (!caller) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `vc-sync:ip:${clientIp(request)}`,
    p_window_seconds: IP_WINDOW,
    p_limit: IP_LIMIT,
  })
  if ((limit as { allowed?: boolean } | null)?.allowed === false) {
    return json({ error: 'Too many sync attempts. Please try again later.' }, 429)
  }

  // Resolved through the caller's own client, so RLS and the auth.uid() scope
  // inside vc_my_identity() both apply.
  const { data: identityRow } = await callerClient.rpc('vc_my_identity')
  const identity = identityRow as { email?: string; issuer?: string; vc_sub?: string } | null

  if (!identity?.email) {
    return json({ error: 'No Virtual Campus account is linked to this profile.' }, 404)
  }

  const { data: linkedClaims } = await admin
    .from('vc_identities')
    .select('raw_claims')
    .eq('user_id', caller.id)
    .eq('vc_sub', identity.vc_sub ?? '')
    .maybeSingle()

  const claims = (linkedClaims?.raw_claims ?? {}) as Record<string, unknown>
  const str = (key: string): string | null => {
    const value = claims[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  const [enrollments, catalog] = await Promise.all([
    loadEnrollments(identity.email),
    loadCatalog(),
  ])

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, country, organization')
    .eq('id', caller.id)
    .maybeSingle()

  const generated = buildResumeData(
    {
      // Claims were stored at link time and are the campus's view of this
      // learner; the profile is KTIP's. Prefer the profile, because if the two
      // disagree the user has since edited theirs.
      name: (profile?.display_name as string) || str('name') || identity.email.split('@')[0],
      email: identity.email,
      phone: str('phone_number') ?? str('phone') ?? '',
      country: (profile?.country as string) || str('country'),
      locale: str('locale'),
      institution: (profile?.organization as string) || str('institution') || str('school'),
      program: str('program') ?? str('programme'),
      gradeLevel: str('grade_level') ?? str('grade'),
      role: str('role'),
      website: str('website'),
    },
    enrollments,
    catalog
  )

  const { data: existing } = await callerClient
    .from('resumes')
    .select('data, sources')
    .eq('user_id', caller.id)
    .eq('template', 'viridion')
    .maybeSingle()

  const merged = mergeResume(
    (existing?.data as ResumeData) ?? null,
    (existing?.sources as ResumeSources) ?? null,
    generated,
    RESUME_PATHS
  )

  // Written through the caller's client so RLS is the thing that decides this
  // row belongs to them — the service role is used only for the reads that RLS
  // deliberately blocks.
  const { error: writeError } = await callerClient.from('resumes').upsert(
    {
      user_id: caller.id,
      template: 'viridion',
      data: merged.data,
      sources: merged.sources,
      vc_synced_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,template' }
  )

  if (writeError) return json({ error: 'Could not save the refreshed CV.' }, 500)

  return json(
    {
      ok: true,
      courses: merged.data.courses.length,
      completed: merged.data.courses.filter((c) => c.status === 'completed').length,
      skipped: RESUME_PATHS.filter((p) => merged.sources[p] === 'manual'),
    },
    200
  )
}
