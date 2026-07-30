import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { JWTPayload } from 'jose'
import {
  exchangeCode,
  fetchUserinfo,
  mapClaims,
  readVcConfig,
  replayKey,
  verifyVcToken,
  VcTokenError,
  type VcClaims,
} from '../../_lib/vc-oidc'
import { loadCatalog, loadEnrollments } from '../../_lib/vc-catalog'
import { buildResumeData, mergeResume } from '../../_lib/cv-build'
import { RESUME_PATHS, type ResumeData, type ResumeSources } from '../../../src/types/resume'

export const config = { runtime: 'edge' }

/**
 * OECS Virtual Campus sign-in.
 *
 * A learner presses "Go to KTIP" on the Virtual Campus and their browser is
 * sent here with a signed assertion:
 *
 *   GET /auth/vc/callback?vc_token=<jwt>
 *
 * The path has no /api prefix because that is the URL registered with the
 * Virtual Campus. vercel.json rewrites it to this function, and the rewrite
 * sits ABOVE the SPA catch-all or index.html would swallow it.
 *
 * This handler is the trust boundary. Everything after it treats the identity
 * as established, so every rejection below is load-bearing:
 *
 *   1. Rate limit first, unconditionally, before any lookup — the counters must
 *      not encode whether an account exists.
 *   2. ES256 signature against the Virtual Campus JWKS, with `alg` pinned and
 *      issuer/audience/expiry checked (api/_lib/vc-oidc.ts).
 *   3. `email_verified === true`. This is the account-takeover boundary: the
 *      handler links by email, so an unverified address would let anyone who
 *      can register it on the Virtual Campus inherit the matching KTIP account.
 *   4. Single-use. The token sits in browser history; replay must not sign
 *      anyone in a second time.
 *
 * On success the browser never sees the Supabase session in a URL. The session
 * is stashed server-side and swapped for a one-time ticket, which the SPA
 * exchanges over POST at /api/auth/vc/session.
 *
 * Failures redirect to /login?vc_error=<code> rather than rendering JSON — this
 * URL is reached by a human clicking a button, not by a client library.
 */

const IP_LIMIT = 20
const IP_WINDOW = 900
const IP_DAILY_LIMIT = 200
const IP_DAILY_WINDOW = 86400

const TICKET_TTL_SECONDS = 120

/** Vercel's proxy overwrites all three, so none of them is client-controlled. */
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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function redirect(origin: string, path: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}${path}`,
      // The inbound URL carries a credential. Referrer-Policy is already
      // strict-origin-when-cross-origin site-wide, and no-store keeps the
      // redirect itself out of any shared cache.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

function fail(origin: string, code: string, detail?: string): Response {
  // Logged with the code only. The token, the claims and the email stay out of
  // the log — a log line is not a place to put somebody's identity document.
  console.warn(`[vc-callback] rejected: ${code}${detail ? ` (${detail})` : ''}`)
  return redirect(origin, `/login?vc_error=${encodeURIComponent(code)}`)
}

/**
 * Finds the KTIP account this learner already has, if any.
 *
 * Order matters and mirrors the rest of the platform: an existing VC link wins
 * over an email match, because the link is a fact we recorded and the email is
 * an assertion we are being handed. Within email matching, a primary address
 * beats a verified alias — the same precedence resolve_email_alias() encodes.
 */
async function resolveExistingUser(
  admin: SupabaseClient,
  issuer: string,
  sub: string,
  email: string
): Promise<{ userId: string | null; matched: string }> {
  const { data: link } = await admin
    .from('vc_identities')
    .select('user_id')
    .eq('issuer', issuer)
    .eq('vc_sub', sub)
    .maybeSingle()

  if (link?.user_id) return { userId: link.user_id as string, matched: 'vc_sub' }

  const { data: resolved } = await admin.rpc('vc_resolve_user_by_email', { p_email: email })
  const row = resolved as { user_id: string | null; matched: string } | null
  if (row?.user_id) return { userId: row.user_id, matched: row.matched }

  return { userId: null, matched: 'none' }
}

/**
 * Creates the auth user for a first-time arrival.
 *
 * `email_confirm: true` is correct and not a shortcut: the Virtual Campus has
 * already verified this address, we checked that it said so, and sending our
 * own confirmation email would ask the learner to prove something twice.
 *
 * The metadata is read by handle_new_user() (migration 044, extended in 082),
 * which seeds the profile row in the same transaction as the insert. Roles are
 * deliberately absent — the trigger's insert guard would strip `student` anyway,
 * and granting it is vc_provision_identity's job.
 */
async function createUser(admin: SupabaseClient, claims: VcClaims) {
  const { data, error } = await admin.auth.admin.createUser({
    email: claims.email,
    email_confirm: true,
    user_metadata: {
      display_name: claims.name,
      full_name: claims.name,
      avatar_url: claims.picture ?? undefined,
      country: claims.country ?? undefined,
      organization: claims.institution ?? undefined,
      // 082 columns. Landing them on the profile rather than leaving them in
      // vc_identities.raw_claims is what lets the KTIP generator, the directory
      // and the CV all see the same phone number and website.
      phone_number: claims.phone || undefined,
      website: claims.website ?? undefined,
      vc_sub: claims.sub,
    },
  })
  if (error || !data?.user) throw new Error(error?.message ?? 'createUser returned no user')
  return data.user
}

/**
 * Mints a real Supabase session for a user the server has already authenticated
 * by other means.
 *
 * generateLink produces a magic-link token without sending mail; verifyOtp
 * redeems it into an access/refresh pair. This is the only supported way to
 * hand out a session without a password, and it goes through GoTrue so the
 * resulting tokens are ordinary in every respect.
 */
async function mintSession(
  admin: SupabaseClient,
  supabaseUrl: string,
  anonKey: string,
  email: string
) {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const hashedToken = linkData?.properties?.hashed_token
  if (linkError || !hashedToken) {
    throw new Error(linkError?.message ?? 'generateLink returned no token')
  }

  // persistSession off: the edge runtime has no storage and this client is
  // discarded after one call.
  const otpClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: verified, error: verifyError } = await otpClient.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink',
  })
  if (verifyError || !verified?.session) {
    throw new Error(verifyError?.message ?? 'verifyOtp returned no session')
  }
  return verified.session
}

/**
 * Copies claim data onto the profile without overwriting anything the user has
 * already set. A learner who has written their own bio and picked their own
 * avatar must not have it replaced every time they arrive from the campus.
 */
async function seedProfile(admin: SupabaseClient, userId: string, claims: VcClaims) {
  const base = 'display_name, avatar_url, country, organization, skills'
  // 082 may not be applied on this deploy. Selecting a column PostgREST has
  // never seen fails the whole statement, and a profile seed is not worth
  // failing a sign-in over, so the contact columns are probed separately.
  let profile: Record<string, unknown> | null = null
  let hasContactColumns = true

  const full = await admin
    .from('profiles')
    .select(`${base}, phone, website`)
    .eq('id', userId)
    .maybeSingle()

  if (full.error) {
    hasContactColumns = false
    const fallback = await admin.from('profiles').select(base).eq('id', userId).maybeSingle()
    profile = (fallback.data as Record<string, unknown> | null) ?? null
  } else {
    profile = (full.data as Record<string, unknown> | null) ?? null
  }

  const updates: Record<string, unknown> = {}
  if (!profile?.display_name && claims.name) updates.display_name = claims.name
  if (!profile?.avatar_url && claims.picture) updates.avatar_url = claims.picture
  if (!profile?.country && claims.country) updates.country = claims.country
  if (!profile?.organization && claims.institution) updates.organization = claims.institution
  if (hasContactColumns) {
    if (!profile?.phone && claims.phone) updates.phone = claims.phone
    if (!profile?.website && claims.website) updates.website = claims.website
  }

  // Only ever seeds an empty list. Merging into a list the member has curated
  // would keep re-adding skills they deliberately removed, and every sign-in
  // would undo the edit — the same reason the CV merges whole sections.
  const storedSkills = Array.isArray(profile?.skills) ? (profile.skills as string[]) : []
  if (storedSkills.length === 0 && claims.skills.length > 0) {
    updates.skills = claims.skills.map((skill) => skill.name).slice(0, 30)
  }

  if (Object.keys(updates).length === 0) return
  updates.updated_at = new Date().toISOString()

  // Service role, so guard_profile_privileged_columns bypasses on auth.uid()
  // being NULL. None of these columns are privileged anyway.
  await admin.from('profiles').update(updates).eq('id', userId)
}

/**
 * Builds or refreshes the learner's CV.
 *
 * Never allowed to fail the sign-in. A campus outage, a missing COMMONS_API_KEY or
 * a malformed enrollment payload should cost the user a course list, not their
 * ability to log in.
 */
async function syncResume(admin: SupabaseClient, userId: string, claims: VcClaims) {
  try {
    const [{ enrollments }, catalog] = await Promise.all([
      loadEnrollments(claims.email),
      loadCatalog(),
    ])

    const generated = buildResumeData(
      {
        name: claims.name,
        email: claims.email,
        phone: claims.phone,
        country: claims.country,
        locale: claims.locale,
        institution: claims.institution,
        program: claims.program,
        gradeLevel: claims.gradeLevel,
        role: claims.role,
        website: claims.website,
        credentials: claims.credentials,
        skills: claims.skills,
      },
      enrollments,
      catalog
    )

    const { data: existing } = await admin
      .from('resumes')
      .select('data, sources')
      .eq('user_id', userId)
      .eq('template', 'viridion')
      .maybeSingle()

    const merged = mergeResume(
      (existing?.data as ResumeData) ?? null,
      (existing?.sources as ResumeSources) ?? null,
      generated,
      RESUME_PATHS,
      'vc'
    )

    await admin.from('resumes').upsert(
      {
        user_id: userId,
        template: 'viridion',
        data: merged.data,
        sources: merged.sources,
        vc_synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,template' }
    )
  } catch (err) {
    console.warn(`[vc-callback] resume sync skipped: ${(err as Error).message}`)
  }
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origin = url.origin

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const cfg = readVcConfig()

  if (!supabaseUrl || !serviceKey || !anonKey || !cfg) {
    return fail(origin, 'not_configured')
  }

  // The Virtual Campus can also report its own failures back to this URL.
  const providerError = url.searchParams.get('error')
  if (providerError) return fail(origin, 'provider_error', providerError)

  const admin = createClient(supabaseUrl, serviceKey)
  const ip = clientIp(request)

  // Consumed before anything is looked up, and both buckets unconditionally.
  const [ipLimit, dailyLimit] = await Promise.all([
    admin.rpc('consume_auth_rate_limit', {
      p_bucket: `vc-callback:ip:${ip}`,
      p_window_seconds: IP_WINDOW,
      p_limit: IP_LIMIT,
    }),
    admin.rpc('consume_auth_rate_limit', {
      p_bucket: `vc-callback:ipday:${ip}`,
      p_window_seconds: IP_DAILY_WINDOW,
      p_limit: IP_DAILY_LIMIT,
    }),
  ])

  const limited = [ipLimit, dailyLimit]
    .map((r) => r.data as { allowed: boolean } | null)
    .some((r) => r && r.allowed === false)
  if (limited) return fail(origin, 'rate_limited', `ip=${ip}`)

  // -- Obtain a verified token -------------------------------------------

  const vcToken = url.searchParams.get('vc_token')
  const code = url.searchParams.get('code')

  let payload: JWTPayload
  let rawToken: string
  let userinfo: Record<string, unknown> | null = null

  try {
    if (vcToken) {
      rawToken = vcToken
      payload = await verifyVcToken(vcToken, cfg)
    } else if (code) {
      // KTIP-initiated code flow. The verifier was stashed by
      // api/auth/vc/start.ts against the state value; PKCE is mandatory at this
      // provider, so a missing verifier cannot be worked around.
      const state = url.searchParams.get('state') ?? ''
      if (!state) return fail(origin, 'missing_state')

      const { data: stash } = await admin.rpc('vc_claim_handoff_ticket', {
        p_token_hash: await sha256Hex(`pkce:${state}`),
      })
      const verifier = (stash as { code_verifier?: string } | null)?.code_verifier
      if (!verifier) return fail(origin, 'unknown_state')

      const tokens = await exchangeCode(cfg, code, `${origin}/auth/vc/callback`, verifier)
      if (!tokens.id_token) return fail(origin, 'no_id_token')

      rawToken = tokens.id_token
      payload = await verifyVcToken(tokens.id_token, cfg)
      if (tokens.access_token) userinfo = await fetchUserinfo(cfg, tokens.access_token)
    } else {
      return fail(origin, 'missing_token')
    }
  } catch (err) {
    const errorCode = err instanceof VcTokenError ? err.code : 'verification_failed'
    return fail(origin, errorCode, err instanceof VcTokenError ? err.message : undefined)
  }

  // -- Single use ---------------------------------------------------------

  const key = await replayKey(rawToken, payload)
  const expiresAt = new Date(((payload.exp ?? Math.floor(Date.now() / 1000) + 600) as number) * 1000)
  const { data: firstUse } = await admin.rpc('vc_claim_jti', {
    p_jti: key,
    p_expires_at: expiresAt.toISOString(),
  })
  if (firstUse !== true) return fail(origin, 'token_replayed')

  // userinfo can only add claims the id_token omitted; it can never override a
  // signed one, so the verified payload is merged last.
  const claims = mapClaims(userinfo ? ({ ...userinfo, ...payload } as JWTPayload) : payload)

  // -- Resolve or create the account --------------------------------------

  let userId: string
  let isNew = false
  try {
    const existing = await resolveExistingUser(admin, claims.issuer || cfg.issuer, claims.sub, claims.email)
    if (existing.userId) {
      userId = existing.userId
    } else {
      const created = await createUser(admin, claims)
      userId = created.id
      isNew = true
    }
  } catch (err) {
    return fail(origin, 'provisioning_failed', (err as Error).message)
  }

  // Suspension is checked here rather than left to RLS: handing out a session
  // and letting every subsequent query come back empty is a worse experience,
  // and a suspended account should not be re-provisioned as a student.
  const { data: profile } = await admin
    .from('profiles')
    .select('is_suspended, suspended_until')
    .eq('id', userId)
    .maybeSingle()

  if (
    profile?.is_suspended &&
    (!profile.suspended_until || new Date(profile.suspended_until as string) > new Date())
  ) {
    return fail(origin, 'account_suspended')
  }

  // -- Link, grant, populate ----------------------------------------------

  const { data: provisioned, error: provisionError } = await admin.rpc('vc_provision_identity', {
    p_user: userId,
    p_issuer: claims.issuer || cfg.issuer,
    p_vc_sub: claims.sub,
    p_email: claims.email,
    p_claims: claims.raw,
    p_birth_year: claims.birthYear,
  })

  const result = provisioned as { ok?: boolean; reason?: string } | null
  if (provisionError || result?.ok !== true) {
    return fail(origin, result?.reason ?? 'link_failed', provisionError?.message)
  }

  await seedProfile(admin, userId, claims)
  await syncResume(admin, userId, claims)

  // -- Hand the session over ----------------------------------------------

  let session
  try {
    session = await mintSession(admin, supabaseUrl, anonKey, claims.email)
  } catch (err) {
    return fail(origin, 'session_failed', (err as Error).message)
  }

  // 32 bytes of CSPRNG. Only its hash is stored, so the row is useless to
  // anyone who reads the table.
  const ticketBytes = crypto.getRandomValues(new Uint8Array(32))
  const ticket = Array.from(ticketBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const { error: ticketError } = await admin.from('vc_handoff_tickets').insert({
    token_hash: await sha256Hex(ticket),
    user_id: userId,
    payload: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      is_new_user: isNew,
    },
    expires_at: new Date(Date.now() + TICKET_TTL_SECONDS * 1000).toISOString(),
  })

  if (ticketError) return fail(origin, 'ticket_failed', ticketError.message)

  console.log(`[vc-callback] signed in user=${userId} new=${isNew}`)

  return redirect(origin, `/auth/vc/land?t=${ticket}`)
}
