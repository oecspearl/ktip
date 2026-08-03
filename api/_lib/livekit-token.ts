/**
 * LiveKit access tokens, signed with Web Crypto.
 *
 * A LiveKit token is an ordinary HS256 JWT with one custom claim — `video`,
 * carrying the room and the permissions — so this is forty lines rather than a
 * dependency. That is the whole reason it is hand-rolled:
 * `livekit-server-sdk` is built for Node, and every route in api/ runs on the
 * edge runtime. Pulling a Node-targeted package in to build a string we can
 * build here would mean either moving this route off the edge or discovering the
 * incompatibility at deploy time.
 *
 * Kept as its own module, separate from the handler, so the signing is unit
 * testable without a Supabase client or a live request — the token IS the
 * permission, and a permission worth enforcing in Postgres is worth asserting on
 * in a test.
 *
 * If this ever needs the parts of the SDK that are genuinely hard (Egress,
 * server-side room administration), swap it for `livekit-server-sdk` inside a
 * Node route; the claim shape below is the documented wire format and does not
 * change.
 */

/**
 * The `video` grant, using LiveKit's exact key casing.
 *
 * camelCase on the wire and snake_case coming out of Postgres, which is why the
 * handler maps between them explicitly rather than spreading the RPC result in.
 */
export interface VideoGrant {
  room: string
  roomJoin: boolean
  canSubscribe: boolean
  canPublish: boolean
  canPublishData: boolean
}

export interface AccessTokenOptions {
  apiKey: string
  apiSecret: string
  /** Stable per-person id. The member's user id, never a display name. */
  identity: string
  /** Shown on the tile. Cosmetic, and safe to be absent. */
  name?: string
  grant: VideoGrant
  /** Seconds. Short on purpose — see the note in the handler. */
  ttlSeconds: number
  /** Injected so tests are not a function of the wall clock. */
  now?: () => number
}

/** base64url, without the `=` padding JWT forbids. */
function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeJson(value: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)))
}

/**
 * Mint a signed join token.
 *
 * `iss` is the API key and `sub` is the participant identity — that pairing is
 * what lets the media server look up the right secret and then trust the
 * permissions inside, without a callback to us.
 */
export async function createAccessToken(options: AccessTokenOptions): Promise<string> {
  const nowMs = (options.now ?? Date.now)()
  const issuedAt = Math.floor(nowMs / 1000)

  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    iss: options.apiKey,
    sub: options.identity,
    // Backdated by a minute. Server clocks drift, and a token rejected as
    // "not yet valid" fails in a way that looks exactly like a bad secret.
    nbf: issuedAt - 60,
    exp: issuedAt + options.ttlSeconds,
    ...(options.name ? { name: options.name } : {}),
    video: options.grant,
  }

  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(options.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput)
  )

  return `${signingInput}.${base64url(new Uint8Array(signature))}`
}
