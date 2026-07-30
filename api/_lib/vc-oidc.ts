import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

/**
 * OECS Virtual Campus token verification and claim mapping.
 *
 * The Virtual Campus is a real OIDC provider, but an incomplete one, and the
 * gaps are load-bearing enough to write down:
 *
 *   * `https://oecscampus.org/.well-known/openid-configuration` returns the
 *     site's HTML login page, not JSON. Discovery is NOT deployed. Every
 *     endpoint below is therefore configured explicitly and must not be
 *     "simplified" into a discovery fetch — that would return HTML and fail
 *     at runtime, not at build time.
 *   * The signing key is EC P-256 / ES256 (kid `vc-oidc-1`), not RSA. `alg` is
 *     pinned below; accepting whatever the header claims is the classic JWT
 *     downgrade.
 *   * `/api/auth/oidc/authorize` rejects any request without `code_challenge`
 *     and `code_challenge_method` — PKCE is mandatory, not optional. That only
 *     matters for the KTIP-initiated flow in api/auth/vc/start.ts.
 *
 * Two token shapes arrive at the callback and both land here:
 *   1. `?vc_token=<jwt>` — the Virtual Campus mints a handoff assertion itself
 *      when a learner presses "Go to KTIP". Verified directly against JWKS.
 *   2. `?code=…&state=…` — the ordinary code flow. The code is exchanged at the
 *      token endpoint and the resulting id_token comes back through this same
 *      verifier, so there is one place where a token becomes trusted.
 */

export interface VcConfig {
  issuer: string
  jwksUrl: string
  clientId: string
  clientSecret?: string
  authorizeUrl: string
  tokenUrl: string
  userinfoUrl: string
}

export function readVcConfig(): VcConfig | null {
  const issuer = process.env.VC_ISSUER
  const jwksUrl = process.env.VC_JWKS_URL
  const clientId = process.env.VC_CLIENT_ID
  if (!issuer || !jwksUrl || !clientId) return null

  const base = issuer.replace(/\/+$/, '')
  return {
    issuer,
    jwksUrl,
    clientId,
    clientSecret: process.env.VC_CLIENT_SECRET,
    authorizeUrl: process.env.VC_AUTHORIZE_URL || `${base}/api/auth/oidc/authorize`,
    tokenUrl: process.env.VC_TOKEN_URL || `${base}/api/auth/oidc/token`,
    userinfoUrl: process.env.VC_USERINFO_URL || `${base}/api/auth/oidc/userinfo`,
  }
}

/**
 * Module-scope so the key set survives between invocations on a warm edge
 * isolate. jose handles the kid-miss refetch and the cooldown that stops an
 * attacker forcing unbounded JWKS requests by sending unknown kids.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let jwksUrlInUse = ''

function keySet(url: string) {
  if (!jwks || jwksUrlInUse !== url) {
    jwks = createRemoteJWKSet(new URL(url), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
      timeoutDuration: 5_000,
    })
    jwksUrlInUse = url
  }
  return jwks
}

export class VcTokenError extends Error {
  // Assigned in the body rather than declared as a parameter property: those
  // are not type-erasable, and this project builds with erasableSyntaxOnly.
  code: string

  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'VcTokenError'
  }
}

/**
 * Verifies a Virtual Campus assertion and returns its claims.
 *
 * `maxTokenAge` is separate from `exp` on purpose: a handoff token is meant to
 * be redeemed within seconds of the button press, and the issuer's own `exp`
 * may be far more generous than that. This caps the window regardless.
 */
export async function verifyVcToken(token: string, cfg: VcConfig): Promise<JWTPayload> {
  if (!token || token.length > 8192) throw new VcTokenError('malformed')

  let payload: JWTPayload
  try {
    ;({ payload } = await jwtVerify(token, keySet(cfg.jwksUrl), {
      issuer: cfg.issuer,
      audience: cfg.clientId,
      algorithms: ['ES256'],
      clockTolerance: '60s',
      maxTokenAge: '10m',
    }))
  } catch (err) {
    throw new VcTokenError('invalid_signature', (err as Error)?.message)
  }

  if (!payload.sub) throw new VcTokenError('no_subject')

  // The single rule standing between "this email is asserted" and "this account
  // is yours". Without it, anyone who can register an address on the Virtual
  // Campus inherits the KTIP account that already uses it.
  if (payload.email_verified !== true) throw new VcTokenError('email_unverified')

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new VcTokenError('no_email')
  }

  return payload
}

/**
 * Replay key for a token. Prefers `jti`; falls back to a hash of the token
 * itself so a provider that omits `jti` still gets single-use semantics rather
 * than silently getting none.
 */
export async function replayKey(token: string, payload: JWTPayload): Promise<string> {
  if (typeof payload.jti === 'string' && payload.jti.length > 0) {
    return `jti:${payload.jti.slice(0, 200)}`
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return (
    'tok:' +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  )
}

// ---------------------------------------------------------------------------
// Claim mapping
// ---------------------------------------------------------------------------

/**
 * The Virtual Campus has not published its claim set, and discovery — which
 * would have carried `claims_supported` — is not deployed. So rather than
 * hardcode names and silently drop everything that does not match, each target
 * is resolved through a list of candidates, and the entire verified payload is
 * stored in vc_identities.raw_claims.
 *
 * That column is the feedback loop: once real tokens have landed, the lists
 * below get tightened from what actually arrived instead of from guesswork.
 * Adding a candidate here is a one-line change and needs no migration.
 */
const CLAIM_ALIASES = {
  name: ['name', 'full_name', 'fullName', 'display_name', 'displayName', 'preferred_username'],
  givenName: ['given_name', 'givenName', 'first_name', 'firstName'],
  familyName: ['family_name', 'familyName', 'last_name', 'lastName', 'surname'],
  picture: ['picture', 'avatar_url', 'avatarUrl', 'image', 'photo'],
  phone: ['phone_number', 'phoneNumber', 'phone', 'mobile'],
  country: ['country', 'country_code', 'countryCode'],
  locale: ['locale', 'language', 'lang'],
  institution: ['institution', 'school', 'organization', 'organisation', 'org', 'campus'],
  program: ['program', 'programme', 'course_of_study', 'courseOfStudy', 'major', 'faculty'],
  gradeLevel: ['grade_level', 'gradeLevel', 'grade', 'year_of_study', 'level'],
  // `roles` before `role`: a provider that sends both is describing the same
  // thing, and the array is the richer one. pick() takes the first element.
  role: ['roles', 'role', 'user_type', 'userType', 'account_type', 'accountType'],
  birthdate: ['birthdate', 'birth_date', 'birthDate', 'dob', 'date_of_birth'],
  website: ['website', 'profile', 'url', 'homepage'],
} as const

/**
 * A certificate or award the learner chose to share at sign-in.
 *
 * `vc:credentials` is a namespaced claim, so it survives none of the alias
 * guessing above — it is read by name, from a list of spellings, and every
 * field is re-validated here. The token is signed, which makes it authentic,
 * not well-formed: a signed array of nulls is still an array of nulls, and this
 * data ends up on a document somebody hands to an employer.
 */
export interface VcCredential {
  title: string
  /** The code an employer quotes when checking it. '' when none was shared. */
  verificationCode: string
  /** ISO timestamp, or null when the campus supplied no date. */
  issuedAt: string | null
  /** The campus asserts this is confirmed, not merely recorded. */
  verified: boolean
  /** Public verification page. null unless it is an absolute http(s) URL. */
  verifyUrl: string | null
}

/** A skill the learner chose to share. `vc:skills`; same handling as above. */
export interface VcSkill {
  name: string
  category: string | null
  level: string | null
  verified: boolean
  source: string | null
}

export interface VcClaims {
  sub: string
  issuer: string
  email: string
  name: string
  picture: string | null
  phone: string
  country: string | null
  locale: string | null
  institution: string | null
  program: string | null
  gradeLevel: string | null
  role: string | null
  birthYear: number | null
  website: string | null
  /** Shared certificates. Empty when the learner shared none — not an error. */
  credentials: VcCredential[]
  /** Shared skills. Empty when the learner shared none — not an error. */
  skills: VcSkill[]
  /** The full verified payload, minus the noise every JWT carries. */
  raw: Record<string, unknown>
}

function pick(payload: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
    // Some providers send `roles: ["student"]` where others send `role: "student"`.
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
      return value[0].trim()
    }
  }
  return null
}

/**
 * Caps. A token is 8KB at most, so neither list can be enormous, but the CV is
 * a paginated document and an issuer that starts emitting one credential per
 * lesson should cost the learner a truncated list, not an unrenderable page.
 */
const MAX_CREDENTIALS = 50
const MAX_SKILLS = 100
const MAX_FIELD = 200

const CREDENTIAL_CLAIMS = ['vc:credentials', 'vc_credentials', 'credentials'] as const
const SKILL_CLAIMS = ['vc:skills', 'vc_skills', 'skills'] as const

function firstArray(p: Record<string, unknown>, keys: readonly string[]): unknown[] {
  for (const key of keys) {
    const value = p[key]
    if (Array.isArray(value)) return value
  }
  return []
}

/** Trimmed, length-capped, or null. Numbers are accepted — codes arrive as both. */
function field(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_FIELD) : null
}

/**
 * An ISO date, or null. `new Date(x).toISOString()` would happily normalise
 * "Tuesday" into a real timestamp on some runtimes; requiring the string to
 * start with a date keeps a garbled value out rather than dating a certificate
 * wrongly on a CV.
 */
function isoDate(value: unknown): string | null {
  const raw = field(value)
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * An absolute http(s) URL, or null.
 *
 * This one is rendered as a link on a public CV, so `javascript:` and `data:`
 * are excluded here rather than left to whatever sanitiser happens to be
 * downstream of the renderer.
 */
function httpUrl(value: unknown): string | null {
  const raw = field(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * `vc:credentials` -> validated list. Entries without a title are dropped: a
 * verification code with nothing to name is not a credential, and rendering it
 * as an untitled row helps nobody.
 */
export function parseCredentials(payload: Record<string, unknown>): VcCredential[] {
  const seen = new Set<string>()
  const out: VcCredential[] = []

  for (const entry of firstArray(payload, CREDENTIAL_CLAIMS)) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const title = field(item.title ?? item.name)
    if (!title) continue

    const code = field(item.verification_code ?? item.verificationCode) ?? ''
    // The same certificate can arrive twice when a learner shares overlapping
    // sets. Title+code identifies it; two distinct certificates never share both.
    const key = `${title.toLowerCase()}|${code.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      title,
      verificationCode: code,
      issuedAt: isoDate(item.issued_at ?? item.issuedAt),
      verified: item.verified === true,
      verifyUrl: httpUrl(item.verify_url ?? item.verifyUrl),
    })
    if (out.length >= MAX_CREDENTIALS) break
  }

  // Newest first, undated last — a CV leads with the most recent achievement.
  return out.sort((a, b) => {
    if (a.issuedAt && b.issuedAt) return b.issuedAt.localeCompare(a.issuedAt)
    if (a.issuedAt) return -1
    if (b.issuedAt) return 1
    return a.title.localeCompare(b.title)
  })
}

/** `vc:skills` -> validated list. Plain strings are accepted alongside objects. */
export function parseSkills(payload: Record<string, unknown>): VcSkill[] {
  const seen = new Set<string>()
  const out: VcSkill[] = []

  for (const entry of firstArray(payload, SKILL_CLAIMS)) {
    // profiles.skills is a text[] and some providers send the same shape, so a
    // bare string is a legitimate entry rather than a malformed object.
    const item =
      typeof entry === 'string'
        ? ({ name: entry } as Record<string, unknown>)
        : entry && typeof entry === 'object'
          ? (entry as Record<string, unknown>)
          : null
    if (!item) continue

    const name = field(item.name ?? item.title)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      name,
      category: field(item.category),
      level: field(item.level),
      verified: item.verified === true,
      source: field(item.source),
    })
    if (out.length >= MAX_SKILLS) break
  }

  return out
}

/**
 * Last-resort name from an email local part: "ama.charles" -> "Ama Charles".
 * Only ever used when the token carried no name at all, and the user can
 * correct it in the CV editor.
 */
function titleCase(local: string): string {
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

/** Registered JWT claims carry no profile information and only bloat the row. */
const PROTOCOL_CLAIMS = new Set([
  'iss', 'aud', 'exp', 'iat', 'nbf', 'jti', 'nonce', 'at_hash', 'c_hash', 'azp', 'sid', 'auth_time',
])

export function mapClaims(payload: JWTPayload): VcClaims {
  const p = payload as unknown as Record<string, unknown>

  const given = pick(p, CLAIM_ALIASES.givenName)
  const family = pick(p, CLAIM_ALIASES.familyName)
  const composed = [given, family].filter(Boolean).join(' ').trim()
  const email = String(p.email ?? '').trim().toLowerCase()

  // Country can hide inside the standard `address` object, which is the one
  // OIDC claim that is a nested structure rather than a string.
  let country = pick(p, CLAIM_ALIASES.country)
  const address = p.address
  if (!country && address && typeof address === 'object') {
    const c = (address as Record<string, unknown>).country
    if (typeof c === 'string' && c.trim()) country = c.trim()
  }

  // Year only. student_safeguarding deliberately stores no full date of birth
  // for a child, so nothing finer than the year is ever extracted here.
  let birthYear: number | null = null
  const birthdate = pick(p, CLAIM_ALIASES.birthdate)
  if (birthdate) {
    const match = birthdate.match(/(19|20)\d{2}/)
    const year = match ? Number(match[0]) : NaN
    const thisYear = new Date().getUTCFullYear()
    if (Number.isFinite(year) && year > 1900 && year <= thisYear) birthYear = year
  }

  const raw: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(p)) {
    if (!PROTOCOL_CLAIMS.has(key)) raw[key] = value
  }

  return {
    sub: String(payload.sub),
    issuer: String(payload.iss ?? ''),
    email,
    // Falling back to the local part gives a usable display name rather than an
    // empty header on the CV — profiles.display_name has the same fallback.
    // Capitalised because the email was lowercased above, and "ama" set in 22pt
    // at the top of a printed CV reads as a defect.
    name: pick(p, CLAIM_ALIASES.name) || composed || titleCase(email.split('@')[0]) || 'Learner',
    picture: pick(p, CLAIM_ALIASES.picture),
    phone: pick(p, CLAIM_ALIASES.phone) ?? '',
    country,
    locale: pick(p, CLAIM_ALIASES.locale),
    institution: pick(p, CLAIM_ALIASES.institution),
    program: pick(p, CLAIM_ALIASES.program),
    gradeLevel: pick(p, CLAIM_ALIASES.gradeLevel),
    role: pick(p, CLAIM_ALIASES.role),
    birthYear,
    website: pick(p, CLAIM_ALIASES.website),
    credentials: parseCredentials(p),
    skills: parseSkills(p),
    raw,
  }
}

// ---------------------------------------------------------------------------
// Authorization-code flow (KTIP-initiated sign-in)
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token?: string
  id_token?: string
  token_type?: string
  expires_in?: number
}

/**
 * Exchanges an authorization code. `code_verifier` is required by the provider,
 * not merely permitted — see the header note.
 */
export async function exchangeCode(
  cfg: VcConfig,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    code_verifier: codeVerifier,
  })
  if (cfg.clientSecret) body.set('client_secret', cfg.clientSecret)

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new VcTokenError('code_exchange_failed', `${res.status} ${detail.slice(0, 200)}`)
  }
  return (await res.json()) as TokenResponse
}

/**
 * Best-effort enrichment. userinfo may carry claims the id_token omits, but a
 * failure here must never fail the sign-in — the id_token has already been
 * verified and is sufficient on its own.
 */
export async function fetchUserinfo(
  cfg: VcConfig,
  accessToken: string
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(cfg.userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
