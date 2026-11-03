import { describe, expect, it } from 'vitest'
import { usageActionsFor, verifyWebhook } from '../../../api/_lib/livekit-webhook'
import { parseTranslationContext } from '../../../api/_lib/venue-usage'

/**
 * The webhook is the only witness to how long anyone was in a call, so the
 * two things worth pinning are: a forged or altered request is refused, and a
 * genuine one turns into exactly the session changes it should.
 */

const KEY = 'APItestkey'
const SECRET = 'a-test-secret-long-enough-to-be-realistic'
const NOW_MS = 1_700_000_000_000
const now = () => NOW_MS

const ROOM = 'a1b2c3d4-0000-4000-8000-000000000000'
const USER = 'b2c3d4e5-1111-4111-8111-111111111111'

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const enc = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)))

async function sha256Base64(body: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Sign the way LiveKit does: HS256, iss = API key, sha256 = base64 of the body hash. */
async function sign(
  body: Uint8Array<ArrayBuffer>,
  claims: Record<string, unknown> = {},
  secret = SECRET,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }
): Promise<string> {
  const payload = {
    iss: KEY,
    nbf: NOW_MS / 1000 - 10,
    exp: NOW_MS / 1000 + 300,
    sha256: await sha256Base64(body),
    ...claims,
  }
  const input = `${enc(header)}.${enc(payload)}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input)))
  return `${input}.${b64url(signature)}`
}

const bodyOf = (event: unknown) => new TextEncoder().encode(JSON.stringify(event))

const leftEvent = {
  event: 'participant_left',
  id: 'EV_1',
  createdAt: String(NOW_MS / 1000),
  room: { sid: 'RM_1', name: ROOM },
  participant: { sid: 'PA_1', identity: USER, joinedAt: String(NOW_MS / 1000 - 600) },
}

describe('verifyWebhook', () => {
  it('accepts a genuine webhook and returns its event', async () => {
    const body = bodyOf(leftEvent)
    const result = await verifyWebhook(body, await sign(body), { apiKey: KEY, apiSecret: SECRET, now })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.event.event).toBe('participant_left')
  })

  it('tolerates a Bearer prefix', async () => {
    const body = bodyOf(leftEvent)
    const result = await verifyWebhook(body, `Bearer ${await sign(body)}`, {
      apiKey: KEY,
      apiSecret: SECRET,
      now,
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a missing or malformed header', async () => {
    const body = bodyOf(leftEvent)
    expect((await verifyWebhook(body, null, { apiKey: KEY, apiSecret: SECRET, now })).ok).toBe(false)
    expect((await verifyWebhook(body, 'not.a', { apiKey: KEY, apiSecret: SECRET, now })).ok).toBe(false)
  })

  it('refuses a body changed after signing', async () => {
    const token = await sign(bodyOf(leftEvent))
    const tampered = bodyOf({ ...leftEvent, participant: { ...leftEvent.participant, joinedAt: '1' } })
    const result = await verifyWebhook(tampered, token, { apiKey: KEY, apiSecret: SECRET, now })
    expect(result).toEqual({ ok: false, reason: 'body hash mismatch' })
  })

  it('refuses a token signed with another secret', async () => {
    const body = bodyOf(leftEvent)
    const result = await verifyWebhook(body, await sign(body, {}, 'some-other-secret'), {
      apiKey: KEY,
      apiSecret: SECRET,
      now,
    })
    expect(result).toEqual({ ok: false, reason: 'bad signature' })
  })

  it('refuses another API key, an expired token and a non-HS256 header', async () => {
    const body = bodyOf(leftEvent)
    const opts = { apiKey: KEY, apiSecret: SECRET, now }
    expect(await verifyWebhook(body, await sign(body, { iss: 'APIother' }), opts)).toEqual({
      ok: false,
      reason: 'wrong issuer',
    })
    expect(await verifyWebhook(body, await sign(body, { exp: NOW_MS / 1000 - 3600 }), opts)).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(
      await verifyWebhook(body, await sign(body, {}, SECRET, { alg: 'none', typ: 'JWT' }), opts)
    ).toEqual({ ok: false, reason: 'unexpected algorithm' })
  })

  it('refuses a token with no body hash', async () => {
    const body = bodyOf(leftEvent)
    const result = await verifyWebhook(body, await sign(body, { sha256: undefined }), {
      apiKey: KEY,
      apiSecret: SECRET,
      now,
    })
    expect(result).toEqual({ ok: false, reason: 'missing body hash' })
  })
})

describe('usageActionsFor', () => {
  it('closes a call with LiveKit join time and an idempotency key', () => {
    expect(usageActionsFor(leftEvent, now)).toEqual([
      {
        op: 'close',
        kind: 'call',
        roomId: ROOM,
        userId: USER,
        sid: 'PA_1',
        at: new Date(NOW_MS).toISOString(),
        startedAt: new Date(NOW_MS - 600_000).toISOString(),
        sourceId: 'livekit:EV_1',
      },
    ])
  })

  it('prefers joinedAtMs and accepts numbers as well as strings', () => {
    const [action] = usageActionsFor(
      {
        ...leftEvent,
        createdAt: NOW_MS / 1000,
        participant: { ...leftEvent.participant, joinedAtMs: NOW_MS - 1500 },
      },
      now
    )
    expect(action.op === 'close' && action.startedAt).toBe(new Date(NOW_MS - 1500).toISOString())
  })

  it('opens a call on participant_joined', () => {
    const actions = usageActionsFor({ ...leftEvent, event: 'participant_joined' }, now)
    expect(actions).toEqual([
      {
        op: 'open',
        kind: 'call',
        roomId: ROOM,
        userId: USER,
        sid: 'PA_1',
        at: new Date(NOW_MS - 600_000).toISOString(),
      },
    ])
  })

  it('tracks screen share video only, by name or by number', () => {
    const base = { ...leftEvent, event: 'track_published', track: { sid: 'TR_1', source: 'SCREEN_SHARE' } }
    expect(usageActionsFor(base, now)[0]).toMatchObject({ op: 'open', kind: 'screen_share', sid: 'TR_1' })
    expect(
      usageActionsFor({ ...base, event: 'track_unpublished', track: { sid: 'TR_1', source: 3 } }, now)[0]
    ).toMatchObject({ op: 'close', kind: 'screen_share', sourceId: 'livekit:EV_1' })
    expect(usageActionsFor({ ...base, track: { sid: 'TR_2', source: 'CAMERA' } }, now)).toEqual([])
    expect(usageActionsFor({ ...base, track: { sid: 'TR_3', source: 'SCREEN_SHARE_AUDIO' } }, now)).toEqual([])
  })

  it('ignores rooms and identities that are not venue ids', () => {
    expect(usageActionsFor({ ...leftEvent, room: { name: 'lobby' } }, now)).toEqual([])
    expect(
      usageActionsFor({ ...leftEvent, participant: { ...leftEvent.participant, identity: 'EG_recorder' } }, now)
    ).toEqual([])
  })

  it('ignores events it has no use for', () => {
    expect(usageActionsFor({ ...leftEvent, event: 'room_started' }, now)).toEqual([])
  })
})

describe('parseTranslationContext', () => {
  it('accepts the two venue surfaces with a room id', () => {
    expect(parseTranslationContext({ s: 'chat', r: ROOM })).toEqual({ surface: 'chat', roomId: ROOM })
    expect(parseTranslationContext({ s: 'captions', r: ROOM })).toEqual({ surface: 'captions', roomId: ROOM })
  })

  it('rejects anything else, so the request is simply not metered', () => {
    expect(parseTranslationContext(undefined)).toBeNull()
    expect(parseTranslationContext({ s: 'content', r: ROOM })).toBeNull()
    expect(parseTranslationContext({ s: 'chat', r: 'not-a-uuid' })).toBeNull()
  })
})
