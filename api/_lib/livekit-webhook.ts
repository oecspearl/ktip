/**
 * LiveKit webhooks, verified with Web Crypto.
 *
 * LiveKit signs every webhook the same way it expects join tokens to be
 * signed (see livekit-token.ts): an HS256 JWT in the Authorization header,
 * issued by the API key and signed with the API secret. The JWT carries a
 * `sha256` claim, the base64 SHA-256 of the raw request body. Checking the
 * signature proves LiveKit sent it; checking the hash proves nobody changed
 * the body on the way.
 *
 * Hand-rolled for the same reason the token is: `livekit-server-sdk`'s
 * WebhookReceiver targets Node and the webhook route runs on the edge.
 *
 * Kept apart from the handler so both halves are unit testable without a
 * request or a database: verifyWebhook() decides whether to believe the call,
 * usageActionsFor() decides what it means for the ledger.
 */

/** The parts of a LiveKit WebhookEvent this app reads. Everything is optional on the wire. */
export interface LiveKitWebhookEvent {
  event?: string
  id?: string
  /** Unix seconds. int64, so protojson sends it as a string. */
  createdAt?: string | number
  room?: { sid?: string; name?: string }
  participant?: {
    sid?: string
    identity?: string
    joinedAt?: string | number
    joinedAtMs?: string | number
  }
  track?: { sid?: string; type?: string | number; source?: string | number }
}

export type VerifyResult =
  | { ok: true; event: LiveKitWebhookEvent }
  | { ok: false; reason: string }

export interface VerifyOptions {
  apiKey: string
  apiSecret: string
  /** Injected so tests are not a function of the wall clock. */
  now?: () => number
}

/** Clock drift allowed either side of exp and nbf, in seconds. */
const LEEWAY_SECONDS = 60

function base64urlToBytes(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Unpadded, URL-safe-agnostic, so `abc+/=` and `abc-_` compare equal. */
function normaliseBase64(value: string): string {
  return value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
}

function parseJson<T>(bytes: Uint8Array): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

/**
 * Whether this request really came from LiveKit, and its parsed event if so.
 *
 * `rawBody` must be the exact bytes received. Re-serialising parsed JSON would
 * change whitespace and key order, and the hash would never match.
 */
export async function verifyWebhook(
  rawBody: Uint8Array<ArrayBuffer>,
  authHeader: string | null,
  options: VerifyOptions
): Promise<VerifyResult> {
  if (!authHeader) return { ok: false, reason: 'missing authorization' }
  // LiveKit sends the bare token. A "Bearer " prefix is tolerated so a proxy
  // that adds one does not break verification.
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' }
  const [headerPart, payloadPart, signaturePart] = parts

  let header: { alg?: string } | null
  let payload: { iss?: string; exp?: number; nbf?: number; sha256?: string } | null
  let signature: Uint8Array<ArrayBuffer>
  try {
    header = parseJson(base64urlToBytes(headerPart))
    payload = parseJson(base64urlToBytes(payloadPart))
    signature = base64urlToBytes(signaturePart)
  } catch {
    return { ok: false, reason: 'malformed token' }
  }
  if (!header || !payload) return { ok: false, reason: 'malformed token' }
  // Pinned. Accepting the header's own choice of algorithm is how "alg: none"
  // tokens get through.
  if (header.alg !== 'HS256') return { ok: false, reason: 'unexpected algorithm' }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(options.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  )
  if (!valid) return { ok: false, reason: 'bad signature' }

  if (payload.iss !== options.apiKey) return { ok: false, reason: 'wrong issuer' }

  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1000)
  if (typeof payload.exp === 'number' && nowSeconds > payload.exp + LEEWAY_SECONDS) {
    return { ok: false, reason: 'expired' }
  }
  if (typeof payload.nbf === 'number' && nowSeconds < payload.nbf - LEEWAY_SECONDS) {
    return { ok: false, reason: 'not yet valid' }
  }

  if (typeof payload.sha256 !== 'string' || !payload.sha256) {
    return { ok: false, reason: 'missing body hash' }
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rawBody))
  if (normaliseBase64(bytesToBase64(digest)) !== normaliseBase64(payload.sha256)) {
    return { ok: false, reason: 'body hash mismatch' }
  }

  const event = parseJson<LiveKitWebhookEvent>(rawBody)
  if (!event || typeof event !== 'object') return { ok: false, reason: 'body is not JSON' }
  return { ok: true, event }
}

// ---------------------------------------------------------------------------
// What an event means for the ledger
// ---------------------------------------------------------------------------

export type UsageAction =
  | {
      op: 'open'
      kind: 'call' | 'screen_share'
      roomId: string
      userId: string
      sid: string
      at: string
    }
  | {
      op: 'close'
      kind: 'call' | 'screen_share'
      roomId: string
      userId: string
      sid: string
      at: string
      /** LiveKit's own join time, when the event carries it. */
      startedAt: string | null
      /** Idempotency key: a retried webhook must not count twice. */
      sourceId: string | null
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** int64 seconds, as a string or a number, to an ISO time. */
function secondsToIso(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000).toISOString()
}

function msToIso(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return null
  return new Date(ms).toISOString()
}

/**
 * Screen share video only. SCREEN_SHARE_AUDIO is the same share's sound, and
 * counting both would double every minute. LiveKit's TrackSource enum is
 * CAMERA = 1, MICROPHONE = 2, SCREEN_SHARE = 3, SCREEN_SHARE_AUDIO = 4, sent
 * by name by protojson and by number by older servers.
 */
function isScreenShare(source: string | number | undefined): boolean {
  return source === 'SCREEN_SHARE' || source === 3 || source === '3'
}

/**
 * The session changes one webhook implies. Returns nothing for anything that
 * is not a venue room (room name is the venue room id) and a member (identity
 * is the user id): an egress recorder or an agent joins with another identity
 * and is not a person to bill.
 */
export function usageActionsFor(
  event: LiveKitWebhookEvent,
  now: () => number = Date.now
): UsageAction[] {
  const roomId = event.room?.name ?? ''
  const userId = event.participant?.identity ?? ''
  if (!UUID.test(roomId) || !UUID.test(userId)) return []

  const at = secondsToIso(event.createdAt) ?? new Date(now()).toISOString()
  const sourceId = event.id ? `livekit:${event.id}` : null

  switch (event.event) {
    case 'participant_joined': {
      const sid = event.participant?.sid
      if (!sid) return []
      const joined =
        msToIso(event.participant?.joinedAtMs) ?? secondsToIso(event.participant?.joinedAt) ?? at
      return [{ op: 'open', kind: 'call', roomId, userId, sid, at: joined }]
    }
    case 'participant_left': {
      const sid = event.participant?.sid ?? ''
      const startedAt =
        msToIso(event.participant?.joinedAtMs) ?? secondsToIso(event.participant?.joinedAt)
      return [{ op: 'close', kind: 'call', roomId, userId, sid, at, startedAt, sourceId }]
    }
    case 'track_published': {
      const sid = event.track?.sid
      if (!sid || !isScreenShare(event.track?.source)) return []
      return [{ op: 'open', kind: 'screen_share', roomId, userId, sid, at }]
    }
    case 'track_unpublished': {
      const sid = event.track?.sid
      if (!sid || !isScreenShare(event.track?.source)) return []
      return [
        { op: 'close', kind: 'screen_share', roomId, userId, sid, at, startedAt: null, sourceId },
      ]
    }
    default:
      return []
  }
}
