/**
 * Redaction for telemetry payloads.
 *
 * The monitoring clients used to delete every free-form field, which left
 * Sentry issues with a stack trace and nothing else. The policy now is to send
 * the text and remove the parts that identify a person or grant access.
 *
 * Kept: UUIDs and numeric record IDs. They are needed to correlate an error
 * with a project, grant, or profile row, and they are the intended way to
 * navigate from an error to the record that caused it.
 *
 * Removed: email addresses, bearer tokens, JWTs, and secret-bearing query
 * parameters. These identify a person directly or grant access to their data.
 */

/** Local part is deliberately greedy on dots and plus-addressing. */
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

/** Supabase and Sentry both issue JWTs; three base64url segments after a header. */
const JWT = /\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]+/g

const BEARER = /\bBearer\s+[\w\-._~+/]+=*/gi

/**
 * Secret-bearing query and fragment parameters, including the signed storage
 * URLs Supabase returns. The key is kept so the shape of the URL stays legible.
 */
const SECRET_PARAM =
  /\b(access_token|refresh_token|id_token|token|apikey|api_key|key|signature|sig|password)=[^&#\s"']+/gi

/**
 * Keys whose value is dropped wholesale rather than pattern-matched. Stored
 * normalised: lowercase with separators removed, so `set-cookie`, `Set_Cookie`,
 * and `setCookie` all resolve to the same entry.
 */
const DENIED_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'apikey',
  'secret',
  'servicerolekey',
  'email',
  'emailaddress',
])

const MAX_DEPTH = 6
const MAX_STRING_LENGTH = 2_048

export function isDeniedKey(key: string): boolean {
  return DENIED_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))
}

/**
 * Redacts identifying substrings from one string. UUIDs pass through unchanged.
 */
export function redactText(value: string): string {
  const truncated = value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : value

  return truncated
    .replace(JWT, '[jwt]')
    .replace(BEARER, 'Bearer [token]')
    .replace(SECRET_PARAM, (_match, key: string) => `${key}=[secret]`)
    .replace(EMAIL, '[email]')
}

/**
 * Walks a value, redacting strings and dropping denied keys. Depth is capped so
 * a cyclic or pathological payload cannot stall the beforeSend hook.
 */
export function redactDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return redactText(value) as T
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[depth limit]' as T

  if (Array.isArray(value)) {
    return value.map((entry) => redactDeep(entry, depth + 1)) as T
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
      isDeniedKey(key) ? [key, '[redacted]'] : [key, redactDeep(entry, depth + 1)],
    ),
  ) as T
}
