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
