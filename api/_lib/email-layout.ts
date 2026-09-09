/**
 * The one HTML shell for outbound email.
 *
 * Seven routes each built their own `<html>` string with the same colours and
 * the same 520px card. This is that card once, so a new email is a title, a
 * body and a button rather than a copy of somebody else's markup with the
 * words changed. Inline styles throughout: mail clients strip stylesheets.
 *
 * The body is HTML the caller has already escaped where it carries user text
 * — escapeHtml() is exported for that.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface EmailLayout {
  title: string
  /** The line mail clients show after the subject in the inbox list. */
  preheader?: string
  eyebrow?: string
  /** Already-safe HTML. */
  bodyHtml: string
  cta?: { label: string; url: string }
  /** Small print under the card. Already-safe HTML. */
  footerHtml?: string
}

export function renderEmail(layout: EmailLayout): string {
  const eyebrow = escapeHtml(layout.eyebrow ?? 'KTIP')
  const title = escapeHtml(layout.title)
  const preheader = layout.preheader
    ? `<span style="display:none;font-size:1px;color:#F5F5F2;max-height:0;overflow:hidden;">${escapeHtml(layout.preheader)}</span>`
    : ''
  const cta = layout.cta
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(layout.cta.url)}" style="display:inline-block;background:#041E42;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(layout.cta.label)}</a></p>
    <p style="margin:12px 0 0;font-size:12px;color:#A5A59F;word-break:break-all;">${escapeHtml(layout.cta.url)}</p>`
    : ''
  const footer = layout.footerHtml
    ? `<p style="margin:24px 0 0;font-size:13px;color:#8C8C86;line-height:1.6;">${layout.footerHtml}</p>`
    : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#F5F5F2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2B27;">
  ${preheader}
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8C8C86;">${eyebrow}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${title}</h1>
    <div style="font-size:15px;line-height:1.6;">${layout.bodyHtml}</div>
    ${cta}
    ${footer}
  </div>
</body></html>`
}

/** Fire-and-report: Resend either accepted the message or it did not. */
export async function sendEmail(params: {
  apiKey: string
  from: string
  to: string[]
  subject: string
  html: string
}): Promise<{ sent: boolean; reason?: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: params.from, to: params.to, subject: params.subject, html: params.html }),
  }).catch(() => null)
  if (!res) return { sent: false, reason: 'resend_unreachable' }
  if (!res.ok) return { sent: false, reason: `resend_failed ${res.status}` }
  return { sent: true }
}
