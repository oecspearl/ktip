/**
 * Shared pieces for the work-or-school email proof (migration 145).
 *
 * Deliberately a copy of the shapes in api/auth/add-alias.ts rather than an
 * import from it: an alias can sign in and a proof cannot, and the two should
 * be free to drift. What they share is only the token format and the mail.
 */

export const PROOF_TOKEN_TTL_HOURS = 24
export const PROOF_DAILY_SEND_LIMIT = 5

/** 64 hex characters — two UUIDs with the dashes removed, same as aliases. */
export function mintProofToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Names the requesting account by display name only — never by its primary
 * email — and says exactly what confirming does: a badge, not a login.
 */
export function proofEmailHtml(params: {
  requesterName: string
  verifyUrl: string
  kind: 'trusted' | 'institution' | 'roster'
}) {
  const { requesterName, verifyUrl, kind } = params
  const what =
    kind === 'trusted'
      ? 'Confirming marks that account as verified on KTIP, because this address belongs to a trusted organisation.'
      : 'Confirming links that account to your institution on KTIP, which is what verifies it.'
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">KTIP</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Confirm your work or school email</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">
      The KTIP account belonging to <strong>${escapeHtml(requesterName)}</strong> gave this
      address as their work or school email.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${what}
      This address will not be able to sign in to that account.</p>
    <a href="${verifyUrl}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">Confirm this address</a>
    <p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">
      This link expires in ${PROOF_TOKEN_TTL_HOURS} hours. If you weren't expecting it, ignore this
      email — nothing will be verified.
    </p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${verifyUrl}</p>
  </div>
</body></html>`
}
