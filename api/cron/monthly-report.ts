import { authorizeCron } from '../_lib/cron-auth'
import { siteOrigin } from '../_lib/email'
import { runReport } from '../_lib/report-run'
import type { ReportPeriodKind } from '../../src/lib/kpi-report-schema'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Draft the periodic report for the period that just closed (roadmap §14
 * Table 39). Scheduled for the first of the month at 06:00 UTC in vercel.json;
 * the quarterly route reuses this handler with the kind fixed.
 *
 * The period is overridable — `?kind=month&start=2026-08-01` — so a missed
 * or contested month can be regenerated with the same endpoint rather than a
 * second one that drifts from this.
 */

/** The first day of the most recent CLOSED period of this kind, UTC. */
export function lastClosedPeriodStart(kind: ReportPeriodKind, now = new Date()): string {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  if (kind === 'year') return `${y - 1}-01-01`
  if (kind === 'quarter') {
    const q = Math.floor(m / 3) - 1
    return new Date(Date.UTC(y, q * 3, 1)).toISOString().slice(0, 10)
  }
  return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
}

export function makeReportCron(fixedKind?: ReportPeriodKind) {
  return async function handler(req: Request): Promise<Response> {
    const auth = authorizeCron(req)
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const kindParam = fixedKind ?? url.searchParams.get('kind') ?? 'month'
    if (kindParam !== 'month' && kindParam !== 'quarter' && kindParam !== 'year') {
      return json({ error: `unknown period kind: ${kindParam}` }, 400)
    }
    const kind: ReportPeriodKind = kindParam
    const start = url.searchParams.get('start') || lastClosedPeriodStart(kind)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return json({ error: 'start must be YYYY-MM-DD' }, 400)

    try {
      const result = await runReport({
        kind,
        start,
        supabaseUrl: auth.supabaseUrl,
        serviceKey: auth.serviceKey,
        siteOrigin: siteOrigin(req),
        notify: url.searchParams.get('notify') !== '0',
      })
      return json(
        {
          ok: true,
          kind,
          start,
          report_id: result.report.id,
          model: result.model,
          model_error: result.model_error,
          dropped_keys: result.dropped_keys,
          notified: result.notified,
        },
        200
      )
    } catch (err) {
      // Loud on purpose: a missing report is a missed month, and the roadmap
      // promised one to the OECS Commission.
      return json({ error: 'report generation failed', detail: err instanceof Error ? err.message : String(err) }, 502)
    }
  }
}

export default makeReportCron()
