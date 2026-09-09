import { requirePermission } from '../_lib/require-permission'
import { siteOrigin } from '../_lib/email'
import { runReport } from '../_lib/report-run'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Draft or redraft a period's report on demand — the "Generate" and
 * "Regenerate" buttons on the Reports tab, and the manual path for an annual
 * report, which has no schedule.
 *
 * Gated on org:manage, the key the whole analytics hub reads under. Runs the
 * same pipeline as the cron; the only difference is that nobody is emailed,
 * because the person who pressed the button is looking at the result.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'org:manage')
  if (!guard.ok) return guard.response

  let body: { kind?: string; start?: string }
  try {
    body = (await request.json()) as { kind?: string; start?: string }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const kind = body.kind
  if (kind !== 'month' && kind !== 'quarter' && kind !== 'year') {
    return json({ error: 'kind must be month, quarter or year' }, 400)
  }
  if (!body.start || !/^\d{4}-\d{2}-\d{2}$/.test(body.start)) {
    return json({ error: 'start must be YYYY-MM-DD' }, 400)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL as string
  const serviceKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string

  try {
    const result = await runReport({
      kind,
      start: body.start,
      supabaseUrl,
      serviceKey,
      siteOrigin: siteOrigin(request),
      notify: false,
    })
    return json(
      {
        report: result.report,
        model: result.model,
        model_error: result.model_error,
        dropped_keys: result.dropped_keys,
      },
      200
    )
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'report generation failed' }, 502)
  }
}
