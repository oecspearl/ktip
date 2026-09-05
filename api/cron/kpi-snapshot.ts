export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Take the weekly KPI reading (roadmap §14 Table 39, "Weekly Platform Pulse").
 *
 * WHY THIS RUNS AT ALL. About half the §14 KPIs are point-in-time — MAU, active
 * projects, active mentorships — and cannot be recomputed for a past week from
 * current data. A week nobody takes a reading for is blank permanently. That is
 * the entire justification for a scheduled job rather than a live view.
 *
 * AUTH. Two accepted callers, and neither is a logged-in user:
 *
 *   - Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`
 *   - an operator running the same job by hand with that secret
 *
 * The snapshot function is SECURITY DEFINER and guarded on `org:manage`, so it
 * is called with the service role, which bypasses RLS. That makes the secret
 * check the only thing standing in front of it — hence the constant-time
 * comparison and the refusal to run at all when CRON_SECRET is unset. An
 * unauthenticated endpoint that writes platform-wide reporting data would be a
 * worse hole than the missing history it fixes.
 *
 * Missing CRON_SECRET is a 503, not a 200. A cron that silently no-ops looks
 * exactly like a cron that is working, until the quarter's report is empty.
 */

/** Length-safe, non-short-circuiting compare — a timing oracle on a shared secret is still an oracle. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Monday-anchored, matching date_trunc('week', …) in Postgres. */
function startOfWeek(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const offset = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return json({ error: 'CRON_SECRET is not configured' }, 503)
  }

  const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!presented || !secretsMatch(presented, secret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Supabase credentials are not configured' }, 503)
  }

  // The period is overridable so a missed week can be backfilled with the same
  // endpoint rather than a second one that drifts from this.
  const url = new URL(req.url)
  const periodKind = url.searchParams.get('kind') || 'week'
  const periodStart = url.searchParams.get('start') || startOfWeek()

  if (!['week', 'month', 'quarter', 'year'].includes(periodKind)) {
    return json({ error: `unknown period kind: ${periodKind}` }, 400)
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/snapshot_kpis`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_period_kind: periodKind, p_period_start: periodStart }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Loud on purpose. A failed reading is unrecoverable for a point-in-time
    // metric — there is no re-running it next week for this week's numbers.
    return json(
      { error: 'snapshot failed', status: res.status, detail: detail.slice(0, 500) },
      502
    )
  }

  const written = await res.json().catch(() => null)
  return json({ ok: true, periodKind, periodStart, written }, 200)
}
