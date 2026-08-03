import { describe, expect, it } from 'vitest'
import { createAccessToken } from '../../../api/_lib/livekit-token'

/**
 * The token IS the permission.
 *
 * Everything `venue_room_grant()` decides in Postgres reaches the media server
 * only through these claims — so a wrong key name here does not fail loudly, it
 * silently drops a restriction. `canPublish` misspelled is a listen-only judging
 * room where anyone can unmute, with no error anywhere to notice it by.
 *
 * That is why this is signed by hand and tested, rather than delegated: the
 * claim shape is the contract, and it is small enough to assert on completely.
 */

const KEY = 'APItestkey'
const SECRET = 'a-test-secret-long-enough-to-be-realistic'
/** Fixed clock, so nothing here is a function of when it ran. */
const NOW = () => 1_700_000_000_000

function decode(token: string) {
  const [header, payload, signature] = token.split('.')
  const parse = (part: string) =>
    JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
  return { header: parse(header), payload: parse(payload), signature }
}

const grant = {
  room: 'a1b2c3d4-0000-4000-8000-000000000000',
  roomJoin: true,
  canSubscribe: true,
  canPublish: true,
  canPublishData: true,
}

describe('createAccessToken', () => {
  it('signs an HS256 JWT with three base64url segments and no padding', async () => {
    const token = await createAccessToken({
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      grant,
      ttlSeconds: 1800,
      now: NOW,
    })

    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    // `=` is not legal in a JWT segment, and `+` / `/` are base64 rather than
    // base64url — any of the three means a server-side parse failure.
    expect(token).not.toMatch(/[=+/]/)

    const { header } = decode(token)
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' })
  })

  it('puts the API key in iss and the identity in sub', async () => {
    const token = await createAccessToken({
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      grant,
      ttlSeconds: 1800,
      now: NOW,
    })

    const { payload } = decode(token)
    // iss is how the media server knows which secret to verify against; sub is
    // the participant identity it dedupes and labels tiles by.
    expect(payload.iss).toBe(KEY)
    expect(payload.sub).toBe('user-1')
  })

  it('carries the video grant with LiveKit key casing, verbatim', async () => {
    const token = await createAccessToken({
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      grant: { ...grant, canPublish: false, canPublishData: true },
      ttlSeconds: 1800,
      now: NOW,
    })

    const { payload } = decode(token)
    // Exact object equality, not a property spot-check: a claim that silently
    // stops being sent is the failure mode, and only a full comparison catches
    // a deletion.
    expect(payload.video).toEqual({
      room: grant.room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: false,
      canPublishData: true,
    })
  })

  it('expires at ttl and backdates nbf against clock drift', async () => {
    const token = await createAccessToken({
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      grant,
      ttlSeconds: 1800,
      now: NOW,
    })

    const issuedAt = Math.floor(NOW() / 1000)
    const { payload } = decode(token)
    expect(payload.exp).toBe(issuedAt + 1800)
    // A token rejected as "not yet valid" looks exactly like a bad secret from
    // the client side, which is a miserable thing to debug.
    expect(payload.nbf).toBe(issuedAt - 60)
  })

  it('omits name entirely when there is none, rather than sending empty', async () => {
    const withName = await createAccessToken({
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      name: 'Alex',
      grant,
      ttlSeconds: 1800,
      now: NOW,
    })
    const without = await createAccessToken({
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      grant,
      ttlSeconds: 1800,
      now: NOW,
    })

    expect(decode(withName).payload.name).toBe('Alex')
    expect('name' in decode(without).payload).toBe(false)
  })

  it('produces a signature that verifies against the secret, and only that secret', async () => {
    const token = await createAccessToken({
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      grant,
      ttlSeconds: 1800,
      now: NOW,
    })

    const [header, payload, signature] = token.split('.')
    const signingInput = new TextEncoder().encode(`${header}.${payload}`)
    const raw = Uint8Array.from(
      atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    )

    const verifyWith = async (secret: string) => {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )
      return crypto.subtle.verify('HMAC', key, raw, signingInput)
    }

    expect(await verifyWith(SECRET)).toBe(true)
    // The point of signing at all: a forged token must not open a room.
    expect(await verifyWith(`${SECRET}-wrong`)).toBe(false)
  })

  it('is deterministic — the same input signs to the same token', async () => {
    const args = {
      apiKey: KEY,
      apiSecret: SECRET,
      identity: 'user-1',
      grant,
      ttlSeconds: 1800,
      now: NOW,
    }
    expect(await createAccessToken(args)).toBe(await createAccessToken(args))
  })
})
