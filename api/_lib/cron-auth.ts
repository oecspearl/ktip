/**
 * The check in front of every scheduled route.
 *
 * Two accepted callers, and neither is a logged-in user: Vercel Cron, which
 * sends `Authorization: Bearer $CRON_SECRET`, and an operator running the job
 * by hand with that secret. The routes behind this write platform-wide
 * reporting data with the service role, so this is the only thing standing in
 * front of them — hence the constant-time compare and the refusal to run at
 * all when CRON_SECRET is unset. A cron that silently no-ops looks exactly
 * like a cron that is working, until the quarter's report is empty.
 *
 * Extracted from api/cron/kpi-snapshot.ts, which keeps its own copy.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Length-safe, non-short-circuiting compare — a timing oracle on a shared secret is still an oracle. */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type CronAuth =
  | { ok: true; supabaseUrl: string; serviceKey: string }
  | { ok: false; response: Response }

export function authorizeCron(req: Request): CronAuth {
  const secret = process.env.CRON_SECRET
  if (!secret) return { ok: false, response: json({ error: 'CRON_SECRET is not configured' }, 503) }

  const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!presented || !secretsMatch(presented, secret)) {
    return { ok: false, response: json({ error: 'unauthorized' }, 401) }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, response: json({ error: 'Supabase credentials are not configured' }, 503) }
  }
  return { ok: true, supabaseUrl, serviceKey }
}
