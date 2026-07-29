// @vitest-environment node
//
// Node, not jsdom. jose checks `instanceof Uint8Array`, and jsdom's TextEncoder
// returns one from a different realm, so every signing call fails with
// "payload must be an instance of Uint8Array" before the code under test runs.
// Nothing here touches the DOM anyway — this is the edge runtime's code.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWTPayload } from 'jose'
import { mapClaims, readVcConfig, replayKey, verifyVcToken, VcTokenError } from '../../../api/_lib/vc-oidc'

/**
 * Virtual Campus token verification.
 *
 * This is the trust boundary for the whole SSO feature: everything downstream
 * treats the identity as established, so each rejection below corresponds to a
 * way an attacker could otherwise sign in as somebody else.
 *
 * Tokens are signed with a real ES256 key generated per run and the JWKS is
 * served from a stubbed fetch, so the algorithm pinning and signature checks
 * are genuinely exercised rather than mocked away.
 */

const ISSUER = 'https://oecscampus.org'
const AUDIENCE = 'ktip-production'
const JWKS_URL = 'https://oecscampus.org/api/auth/oidc/jwks'

// jose 6 dropped the KeyLike alias in favour of its own CryptoKey type, which
// is imported above rather than taken from the global — the global one is a
// value (@types/node's class), not a type.
let privateKey: CryptoKey
let publicJwk: Record<string, unknown>
let rsaPrivateKey: CryptoKey
let rsaPublicJwk: Record<string, unknown>

/**
 * Each test gets its own JWKS URL. createRemoteJWKSet caches per URL inside the
 * module, so reusing one would let an earlier test's key set answer a later
 * test and quietly turn a real check into a no-op.
 */
let urlCounter = 0
function config(overrides: Partial<ReturnType<typeof baseConfig>> = {}) {
  return { ...baseConfig(), jwksUrl: `${JWKS_URL}?n=${++urlCounter}`, ...overrides }
}

function baseConfig() {
  return {
    issuer: ISSUER,
    jwksUrl: JWKS_URL,
    clientId: AUDIENCE,
    authorizeUrl: `${ISSUER}/api/auth/oidc/authorize`,
    tokenUrl: `${ISSUER}/api/auth/oidc/token`,
    userinfoUrl: `${ISSUER}/api/auth/oidc/userinfo`,
  }
}

beforeAll(async () => {
  // The real Virtual Campus key is EC P-256 / ES256, kid vc-oidc-1.
  const ec = await generateKeyPair('ES256', { extractable: true })
  privateKey = ec.privateKey
  publicJwk = { ...(await exportJWK(ec.publicKey)), kid: 'vc-oidc-1', alg: 'ES256', use: 'sig' }

  const rsa = await generateKeyPair('RS256', { extractable: true })
  rsaPrivateKey = rsa.privateKey
  rsaPublicJwk = { ...(await exportJWK(rsa.publicKey)), kid: 'vc-oidc-1', alg: 'RS256', use: 'sig' }
})

function serveJwks(keys: Record<string, unknown>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ keys }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  )
}

async function sign(
  claims: JWTPayload,
  opts: { alg?: string; key?: CryptoKey; issuer?: string; audience?: string; expiresIn?: string; issuedAt?: number } = {}
) {
  const jwt = new SignJWT({ email_verified: true, email: 'learner@example.org', ...claims })
    .setProtectedHeader({ alg: opts.alg ?? 'ES256', kid: 'vc-oidc-1' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setSubject((claims.sub as string) ?? 'vc-user-1')
    .setIssuedAt(opts.issuedAt)
    .setExpirationTime(opts.expiresIn ?? '5m')
  return jwt.sign(opts.key ?? privateKey)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('verifyVcToken', () => {
  it('accepts a well-formed token', async () => {
    serveJwks([publicJwk])
    const payload = await verifyVcToken(await sign({ name: 'Ama' }), config())
    expect(payload.sub).toBe('vc-user-1')
    expect(payload.name).toBe('Ama')
  })

  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('ES256', { extractable: true })
    serveJwks([publicJwk])
    const token = await sign({}, { key: other.privateKey })
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'invalid_signature',
    })
  })

  it('rejects RS256 even when the JWKS offers an RSA key — algorithm confusion', async () => {
    serveJwks([rsaPublicJwk])
    const token = await sign({}, { alg: 'RS256', key: rsaPrivateKey })
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'invalid_signature',
    })
  })

  it('rejects an unsigned token', async () => {
    serveJwks([publicJwk])
    const header = btoa(JSON.stringify({ alg: 'none', kid: 'vc-oidc-1' }))
    const body = btoa(
      JSON.stringify({
        iss: ISSUER,
        aud: AUDIENCE,
        sub: 'x',
        email: 'a@b.org',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 300,
      })
    )
    await expect(verifyVcToken(`${header}.${body}.`, config())).rejects.toBeInstanceOf(VcTokenError)
  })

  it('rejects a token minted for a different audience', async () => {
    serveJwks([publicJwk])
    const token = await sign({}, { audience: 'some-other-client' })
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'invalid_signature',
    })
  })

  it('rejects a token from a different issuer', async () => {
    serveJwks([publicJwk])
    const token = await sign({}, { issuer: 'https://evil.example' })
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'invalid_signature',
    })
  })

  it('rejects an expired token', async () => {
    serveJwks([publicJwk])
    const past = Math.floor(Date.now() / 1000) - 7200
    const token = await new SignJWT({ email: 'a@b.org', email_verified: true })
      .setProtectedHeader({ alg: 'ES256', kid: 'vc-oidc-1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('x')
      .setIssuedAt(past)
      .setExpirationTime(past + 60)
      .sign(privateKey)
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'invalid_signature',
    })
  })

  it('rejects a token that is still within exp but far older than the handoff window', async () => {
    serveJwks([publicJwk])
    // Issued an hour ago with a long life — valid by exp, but a handoff token
    // is meant to be redeemed in seconds. maxTokenAge is what caps it.
    const hourAgo = Math.floor(Date.now() / 1000) - 3600
    const token = await new SignJWT({ email: 'a@b.org', email_verified: true })
      .setProtectedHeader({ alg: 'ES256', kid: 'vc-oidc-1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('x')
      .setIssuedAt(hourAgo)
      .setExpirationTime(hourAgo + 86400)
      .sign(privateKey)
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'invalid_signature',
    })
  })

  it('rejects an unverified email — the account-takeover boundary', async () => {
    serveJwks([publicJwk])
    const token = await sign({ email_verified: false })
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'email_unverified',
    })
  })

  it('rejects a missing email_verified claim rather than assuming it', async () => {
    serveJwks([publicJwk])
    const token = await new SignJWT({ email: 'a@b.org' })
      .setProtectedHeader({ alg: 'ES256', kid: 'vc-oidc-1' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject('x')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({
      code: 'email_unverified',
    })
  })

  it('rejects a token with no usable email address', async () => {
    serveJwks([publicJwk])
    const token = await sign({ email: 'not-an-address' })
    await expect(verifyVcToken(token, config())).rejects.toMatchObject({ code: 'no_email' })
  })

  it('rejects absurdly long input without reaching the verifier', async () => {
    serveJwks([publicJwk])
    await expect(verifyVcToken('a'.repeat(9000), config())).rejects.toMatchObject({
      code: 'malformed',
    })
  })
})

describe('replayKey', () => {
  it('prefers jti when the token carries one', async () => {
    expect(await replayKey('irrelevant', { jti: 'abc123' } as JWTPayload)).toBe('jti:abc123')
  })

  it('falls back to a hash of the token, so a jti-less provider still gets single use', async () => {
    const key = await replayKey('some.jwt.value', {} as JWTPayload)
    expect(key).toMatch(/^tok:[0-9a-f]{64}$/)
    expect(await replayKey('other.jwt.value', {} as JWTPayload)).not.toBe(key)
  })
})

describe('mapClaims', () => {
  const base = { sub: 'u1', iss: ISSUER, email: 'Ama@Example.org', email_verified: true }

  it('lowercases the email', () => {
    expect(mapClaims(base as JWTPayload).email).toBe('ama@example.org')
  })

  it('composes a name from given_name and family_name when name is absent', () => {
    const claims = mapClaims({ ...base, given_name: 'Ama', family_name: 'Charles' } as JWTPayload)
    expect(claims.name).toBe('Ama Charles')
  })

  it('falls back to the email local part rather than leaving the CV headerless', () => {
    expect(mapClaims(base as JWTPayload).name).toBe('Ama')
  })

  it('accepts either of the naming conventions a provider might use', () => {
    expect(mapClaims({ ...base, phone_number: '+1758' } as JWTPayload).phone).toBe('+1758')
    expect(mapClaims({ ...base, phone: '+1758' } as JWTPayload).phone).toBe('+1758')
  })

  it('reads a singular role or the first of a plural one', () => {
    expect(mapClaims({ ...base, role: 'student' } as JWTPayload).role).toBe('student')
    expect(mapClaims({ ...base, roles: ['faculty', 'x'] } as unknown as JWTPayload).role).toBe('faculty')
  })

  it('digs country out of the nested standard address claim', () => {
    const claims = mapClaims({ ...base, address: { country: 'Saint Lucia' } } as unknown as JWTPayload)
    expect(claims.country).toBe('Saint Lucia')
  })

  it('reduces a birthdate to a year — never a full date of birth for a child', () => {
    expect(mapClaims({ ...base, birthdate: '2009-04-17' } as JWTPayload).birthYear).toBe(2009)
  })

  it('discards a birth year that cannot be real', () => {
    expect(mapClaims({ ...base, birthdate: '1066-01-01' } as JWTPayload).birthYear).toBeNull()
  })

  it('keeps unknown claims in raw so the alias table can be corrected later', () => {
    const claims = mapClaims({ ...base, something_unexpected: 'keep me' } as JWTPayload)
    expect(claims.raw.something_unexpected).toBe('keep me')
  })

  it('drops protocol claims from raw — they say nothing about the person', () => {
    const claims = mapClaims({ ...base, exp: 1, iat: 2, jti: 'j', nonce: 'n' } as JWTPayload)
    expect(claims.raw).not.toHaveProperty('exp')
    expect(claims.raw).not.toHaveProperty('jti')
    expect(claims.raw).not.toHaveProperty('nonce')
  })
})

describe('readVcConfig', () => {
  it('returns null when the integration is not switched on', () => {
    vi.stubEnv('VC_ISSUER', '')
    vi.stubEnv('VC_JWKS_URL', '')
    vi.stubEnv('VC_CLIENT_ID', '')
    expect(readVcConfig()).toBeNull()
  })

  it('derives the endpoints from the issuer, since discovery is not deployed', () => {
    vi.stubEnv('VC_ISSUER', ISSUER)
    vi.stubEnv('VC_JWKS_URL', JWKS_URL)
    vi.stubEnv('VC_CLIENT_ID', AUDIENCE)
    vi.stubEnv('VC_AUTHORIZE_URL', '')
    vi.stubEnv('VC_TOKEN_URL', '')
    vi.stubEnv('VC_USERINFO_URL', '')
    const cfg = readVcConfig()
    expect(cfg?.authorizeUrl).toBe(`${ISSUER}/api/auth/oidc/authorize`)
    expect(cfg?.tokenUrl).toBe(`${ISSUER}/api/auth/oidc/token`)
  })
})
