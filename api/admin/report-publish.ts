import { requirePermission } from '../_lib/require-permission'
import { emailFrom, resendKey, siteOrigin } from '../_lib/email'
import { escapeHtml, renderEmail, sendEmail } from '../_lib/email-layout'
import type { KpiReportRow } from '../../src/lib/kpi-report-schema'

export const config = { runtime: 'edge' }

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Publish a report and, if asked, send it to the recipients list.
 *
 * Publishing goes through publish_kpi_report() with the CALLER's client, so
 * published_by is auth.uid() and never a value the request chose. Sending uses
 * the service role afterwards to record sent_at / sent_to on a row that is now
 * read-only to sessions.
 *
 * The email carries the executive summary and a link; the full report lives on
 * the console where it can be printed. Recipients get what a person approved,
 * with the AI's role stated (roadmap §7).
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'org:manage')
  if (!guard.ok) return guard.response
  const { adminClient, callerClient } = guard

  let body: { id?: string; send?: boolean }
  try {
    body = (await request.json()) as { id?: string; send?: boolean }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.id) return json({ error: 'id is required' }, 400)

  const { data: published, error } = await (callerClient as any).rpc('publish_kpi_report', { p_id: body.id })
  if (error) return json({ error: error.message }, error.code === '42501' ? 403 : 409)
  const report = published as KpiReportRow

  if (!body.send) return json({ report, sent: null }, 200)

  const from = emailFrom()
  const key = resendKey()
  if (!from || !key) return json({ report, sent: { sent: false, to: [], reason: 'email not configured' } }, 200)

  const { data: recipients } = await (adminClient as any)
    .from('kpi_report_recipients')
    .select('email,kinds')
    .contains('kinds', [report.period_kind])
  const to = ((recipients as Array<{ email: string }>) || []).map((r) => r.email)
  if (!to.length) return json({ report, sent: { sent: false, to: [], reason: 'no recipients for this kind' } }, 200)

  const label = report.fact_pack?.period?.label ?? report.period_start
  const kindWord = report.period_kind === 'month' ? 'Monthly' : report.period_kind === 'quarter' ? 'Quarterly' : 'Annual'
  const counts = report.fact_pack?.status_counts
  const summary = (report.summary_md ?? '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 8px;">${escapeHtml(p.trim())}</p>`)
    .join('')
  const url = `${siteOrigin(request)}/admin/analytics/reports/${report.id}`

  const html = renderEmail({
    title: `KTIP ${kindWord} Report — ${label}`,
    eyebrow: 'OECS KTIP · Reporting pulse',
    preheader: counts ? `${counts.good} on track, ${counts.warn} at risk, ${counts.bad} off track` : undefined,
    bodyHtml: `${summary || '<p style="margin:0 0 8px;">The figures for this period are attached on the platform; no commentary was written.</p>'}
      ${
        counts
          ? `<p style="margin:8px 0 0;font-size:13px;color:#63635D;">${counts.good} KPIs on track · ${counts.warn} at risk · ${counts.bad} off track · ${counts.none} not yet measured</p>`
          : ''
      }`,
    cta: { label: 'Open the full report', url },
    footerHtml: `${
      report.model
        ? 'Commentary was drafted by an AI model from aggregate platform figures only and reviewed by an administrator before publication. '
        : ''
    }Figures are readings taken by the platform for the period stated; an unmeasured indicator is shown as unmeasured, never as zero.`,
  })

  const result = await sendEmail({ apiKey: key, from, to, subject: `KTIP ${kindWord.toLowerCase()} report — ${label}`, html })
  if (result.sent) {
    await (adminClient as any)
      .from('kpi_reports')
      .update({ sent_at: new Date().toISOString(), sent_to: to })
      .eq('id', report.id)
  }
  return json({ report: { ...report, sent_at: result.sent ? new Date().toISOString() : report.sent_at, sent_to: result.sent ? to : report.sent_to }, sent: { ...result, to } }, 200)
}
