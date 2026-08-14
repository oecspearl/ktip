// Pure helpers for the two-factor flow (118).
//
// Everything here is deliberately free of Supabase and React so it can be
// tested without mocking GoTrue. Mocks of supabase.auth.mfa.* would only encode
// our assumptions about a service we do not control, pass forever, and tell us
// nothing.

/**
 * Alphabet the recovery codes are drawn from. Crockford base32 — no I, L, O or
 * U — so a code read off paper cannot be confused with 1/0, and cannot spell
 * anything a member would rather not type. Must stay in step with
 * issue_mfa_backup_codes() in migration 118.
 */
export const BACKUP_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Characters in one recovery code, excluding the display separator. */
export const BACKUP_CODE_LENGTH = 10

/** Digits in an email OTP and in a TOTP code alike. */
export const OTP_LENGTH = 6

/**
 * mfa.enroll() returns `totp.qr_code` as an SVG. Older auth-js versions hand
 * back a bare `<svg …>` document and document that you should prefix it
 * yourself; newer ones already return a full data URI. Handle both rather than
 * pulling in a QR library the project does not otherwise need.
 */
export function qrCodeSrc(qrCode: string | null | undefined): string | null {
  const value = qrCode?.trim()
  if (!value) return null
  if (value.startsWith('data:')) return value
  return `data:image/svg+xml;utf-8,${encodeURIComponent(value)}`
}

/**
 * The TOTP secret, in groups of four, for the member who cannot scan a QR and
 * is typing it into an authenticator by hand. Grouping is the whole point —
 * a 32-character unbroken string is transcribed wrong.
 */
export function formatSecret(secret: string | null | undefined): string {
  const value = (secret ?? '').replace(/\s+/g, '').toUpperCase()
  if (!value) return ''
  return (value.match(/.{1,4}/g) ?? []).join(' ')
}

/** Display form of a recovery code: XXXXX-XXXXX. */
export function formatBackupCode(code: string): string {
  const value = normaliseBackupCode(code)
  if (value.length !== BACKUP_CODE_LENGTH) return value
  return `${value.slice(0, 5)}-${value.slice(5)}`
}

/**
 * What gets sent to consume_mfa_backup_code(). Mirrors the normalisation that
 * function does in SQL, so the client can validate a code before spending one
 * of the ten attempts an hour the rate limiter allows.
 */
export function normaliseBackupCode(code: string): string {
  return (code ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/** Is this a plausible recovery code? Shape only — the server decides truth. */
export function isPlausibleBackupCode(code: string): boolean {
  const value = normaliseBackupCode(code)
  return (
    value.length === BACKUP_CODE_LENGTH &&
    [...value].every((char) => BACKUP_CODE_ALPHABET.includes(char))
  )
}

/** Keeps only digits, capped at `length`. Used by the shared OTP input. */
export function sanitiseOtp(raw: string, length = OTP_LENGTH): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, length)
}

/** The plain-text file a member downloads from the one-time code sheet. */
export function backupCodesFileContents(codes: string[], accountEmail?: string | null): string {
  const lines = [
    'KTIP recovery codes',
    accountEmail ? `Account: ${accountEmail}` : null,
    '',
    'Each code works once. Keep them somewhere you can reach without your phone.',
    'Generating a new set makes every code below stop working.',
    '',
    ...codes.map((code) => formatBackupCode(code)),
    '',
  ].filter((line) => line !== null)
  return lines.join('\r\n')
}
