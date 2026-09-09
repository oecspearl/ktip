/**
 * Asks api/auth/email-available whether an address already belongs to an
 * account, for the signup form's email field.
 *
 * Three answers, not two. 'unknown' covers every way the question can go
 * unanswered — offline, rate-limited, a server error, an aborted request — and
 * the form treats it as "carry on": signUp() still catches a real duplicate
 * downstream exactly as it does today, so a broken check costs the member
 * nothing but this one early warning. A boolean would have forced the caller
 * to pick a side for every failure, and either side is wrong.
 */
export type EmailAvailability = 'free' | 'taken' | 'unknown'

/** The route's own shape check; mirrored here so nothing unaskable is asked. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const canCheckEmail = (email: string) => {
  const trimmed = email.trim()
  return EMAIL_RE.test(trimmed) && trimmed.length <= 254
}

export async function checkEmailAvailable(
  email: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<EmailAvailability> {
  if (!canCheckEmail(email)) return 'unknown'
  try {
    const res = await fetchImpl('/api/auth/email-available', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
      signal,
    })
    if (!res.ok) return 'unknown'
    const body = (await res.json()) as { in_use?: unknown }
    if (body.in_use === true) return 'taken'
    if (body.in_use === false) return 'free'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
