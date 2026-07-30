import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildKtipResumeData, mergeResume, type KtipCvInput } from '../_lib/cv-build'
import {
  RESUME_PATHS,
  RESUME_TEMPLATE_KEY,
  type ResumeData,
  type ResumeSources,
} from '../../src/types/resume'

export const config = { runtime: 'edge' }

/**
 * Builds a CV out of what KTIP itself knows about the caller.
 *
 * The counterpart to /api/vc/sync. That route needs the Virtual Campus, so it
 * only ever works for a learner who arrived from the campus — which left every
 * member who signed up by email with no stored CV at all. Their document was
 * generated in the browser on each render and thrown away, so `/u/:id/cv`
 * showed nothing and there was no row for the campus sync to later merge into.
 *
 * Everything written here is stamped 'ktip', the lowest rank in the provenance
 * order (see src/types/resume.ts). That is what makes it safe to run on first
 * view without asking: a later campus sync overwrites it, a hand edit outranks
 * both, and re-running it can never undo either.
 *
 * Every read goes through the caller's own client. RLS is what decides which
 * projects, badges and memberships belong to them — the service role is used
 * for the rate-limit RPC only, which is the one thing RLS deliberately blocks.
 */

const IP_LIMIT = 10
const IP_WINDOW = 900

/** A CV is a page, not an archive. Both caps are presentation, not privacy. */
const MAX_PROJECTS = 8
const MAX_AWARDS = 10

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

const BASE_PROFILE_COLUMNS = 'display_name, bio, country, organization, industry, skills, interests, open_to'
const CONTACT_COLUMNS = 'phone, website, languages'

/**
 * The caller's profile, tolerating a deploy that predates migration 082.
 *
 * Selecting a column PostgREST has never seen fails the whole statement, so a
 * route that assumed 082 would 500 for everybody the moment it shipped ahead of
 * the migration. One retry without the contact columns is cheaper than
 * discovering that in production.
 */
async function loadProfile(client: SupabaseClient, userId: string) {
  const full = await client
    .from('profiles')
    .select(`${BASE_PROFILE_COLUMNS}, ${CONTACT_COLUMNS}`)
    .eq('id', userId)
    .maybeSingle()

  if (!full.error) return full.data as KtipCvInput['profile'] | null

  const base = await client
    .from('profiles')
    .select(BASE_PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  return (base.data as KtipCvInput['profile'] | null) ?? null
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
    p_bucket: `cv-generate:ip:${clientIp(request)}`,
    p_window_seconds: IP_WINDOW,
    p_limit: IP_LIMIT,
  })
  if ((limit as { allowed?: boolean } | null)?.allowed === false) {
    return json({ error: 'Too many attempts. Please try again in a few minutes.' }, 429)
  }

  const [profile, projectRows, badgeRows, institutionRows, employerRows, existing] =
    await Promise.all([
      loadProfile(callerClient, caller.id),
      callerClient
        .from('projects')
        .select('title, summary, description, category, phase')
        .eq('owner_id', caller.id)
        // Private projects are excluded deliberately: a CV is a document the
        // member hands to strangers, and "public on KTIP" is the only signal
        // there is that they are willing to talk about it.
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(MAX_PROJECTS),
      callerClient
        .from('user_badges')
        .select('awarded_at, badges(name, description, is_hidden)')
        .eq('user_id', caller.id)
        .order('awarded_at', { ascending: false })
        .limit(MAX_AWARDS),
      callerClient
        .from('institution_members')
        .select('role, approved_at, institutions(name)')
        .eq('user_id', caller.id)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false }),
      callerClient
        .from('employer_members')
        .select('role, employers(trading_name, legal_name)')
        .eq('user_id', caller.id),
      callerClient
        .from('resumes')
        .select('data, sources')
        .eq('user_id', caller.id)
        .eq('template', RESUME_TEMPLATE_KEY)
        .maybeSingle(),
    ])

  if (!profile) return json({ error: 'No profile found for this account.' }, 404)

  type BadgeRow = {
    awarded_at: string | null
    badges: { name: string; description: string | null; is_hidden: boolean | null } | null
  }
  type InstitutionRow = {
    role: string | null
    approved_at: string | null
    institutions: { name: string } | null
  }
  type EmployerRow = {
    role: string | null
    employers: { trading_name: string | null; legal_name: string | null } | null
  }

  const input: KtipCvInput = {
    email: caller.email ?? '',
    profile,
    projects: (projectRows.data ?? []) as KtipCvInput['projects'],
    // A hidden badge is one the member has not been shown yet; putting it on a
    // printed CV would be the reveal.
    awards: ((badgeRows.data ?? []) as unknown as BadgeRow[])
      .filter((row) => row.badges && !row.badges.is_hidden)
      .map((row) => ({
        name: row.badges!.name,
        description: row.badges!.description,
        awarded_at: row.awarded_at,
      })),
    institutions: ((institutionRows.data ?? []) as unknown as InstitutionRow[])
      .filter((row) => row.institutions)
      .map((row) => ({
        name: row.institutions!.name,
        role: row.role,
        approved_at: row.approved_at,
      })),
    employers: ((employerRows.data ?? []) as unknown as EmployerRow[])
      .filter((row) => row.employers)
      .map((row) => ({
        name: row.employers!.trading_name || row.employers!.legal_name || '',
        role: row.role,
      }))
      .filter((row) => row.name !== ''),
  }

  const generated = buildKtipResumeData(input)

  const merged = mergeResume(
    (existing.data?.data as ResumeData) ?? null,
    (existing.data?.sources as ResumeSources) ?? null,
    generated,
    RESUME_PATHS,
    'ktip'
  )

  // No vc_synced_at: this is not a campus sync, and stamping it would tell the
  // member their course history had just been refreshed when it had not.
  const { error: writeError } = await callerClient.from('resumes').upsert(
    {
      user_id: caller.id,
      template: RESUME_TEMPLATE_KEY,
      data: merged.data,
      sources: merged.sources,
    },
    { onConflict: 'user_id,template' }
  )

  if (writeError) return json({ error: 'Could not save your CV.' }, 500)

  return json(
    {
      ok: true,
      created: !existing.data,
      filled: RESUME_PATHS.filter((p) => merged.sources[p] === 'ktip'),
      skipped: RESUME_PATHS.filter(
        (p) => merged.sources[p] === 'manual' || merged.sources[p] === 'vc'
      ),
    },
    200
  )
}
