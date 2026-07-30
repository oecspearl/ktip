/**
 * Single source of truth for the two things every outbound email needs: who it
 * is from, and what host the links in it point at.
 *
 * EMAIL_FROM is the canonical name. INVITE_FROM_EMAIL is the original name and
 * is still honoured so an un-migrated deployment keeps sending mail.
 *
 * SITE_URL is the canonical public origin. It has to be settable, because the
 * request origin is only correct for links built during a browser-initiated
 * request: a Supabase webhook, a cron job, or a call that arrived on a Vercel
 * preview/deployment URL would otherwise bake an unreachable or short-lived
 * host into a link that lives in somebody's inbox for days.
 */

/** The verified `From:` address, or null when delivery is unconfigured. */
export function emailFrom(): string | null {
  const from = process.env.EMAIL_FROM || process.env.INVITE_FROM_EMAIL
  return from?.trim() || null
}

/** The Resend API key, or null when delivery is unconfigured. */
export function resendKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null
}

/**
 * The origin to build user-facing links from: SITE_URL when set, otherwise the
 * origin the request arrived on. Never returns a trailing slash, so callers can
 * concatenate `${siteOrigin(req)}/path` without doubling it.
 */
export function siteOrigin(request: Request): string {
  const configured = process.env.SITE_URL?.trim()
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // A malformed SITE_URL must not take email delivery down with it.
      console.error(`[email] SITE_URL is not a valid URL: ${configured}`)
    }
  }
  return new URL(request.url).origin
}
