import { emailFrom, resendKey } from './email'
import { escapeHtml, renderEmail, sendEmail } from './email-layout'
import { composeFactPack, deterministicOutput, fetchRawFactPack } from './report-fact-pack'
import { REPORT_PROMPT_VERSION, ReportProviderRateLimited, getReportProvider } from './report-provider'
import type { KpiReportRow, ReportOutput, ReportPeriodKind } from '../../src/lib/kpi-report-schema'

/**
 * Generate one report: fact pack → model → row → (optionally) tell the admins.
 *
 * Shared by the scheduled routes and the admin "Regenerate" button so there is
 * one pipeline, not a cron copy and a button copy that drift.
 *
 * Failure policy, in order of what must never happen:
 *   1. A period with no row. The fact pack is fetched first; if THAT fails,
 *      the run fails loudly — there is nothing honest to write.
 *   2. A row whose figures depend on a vendor. If the model fails, is rate
 *      limited, or returns something that does not validate, the row is
 *      written anyway from deterministicOutput(): figures complete, prose
 *      blank, model NULL. The response says so.
 *   3. A notification failure hiding a successful report. Email is last and
 *      its result is reported, never thrown.
 */

export interface RunReportParams {
  kind: ReportPeriodKind
  start: string
  supabaseUrl: string
  serviceKey: string
  /** Origin for links in the notification email. */
  siteOrigin: string
  /** Tell the admin seats a draft is ready. The cron does; the button does not. */
  notify: boolean
}

export interface RunReportResult {
  report: KpiReportRow
  model: string | null
  model_error: string | null
  dropped_keys: string[]
  notified: { sent: boolean; to: string[]; reason?: string } | null
}

const rest = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
})

export async function runReport(params: RunReportParams): Promise<RunReportResult> {
  const { kind, start, supabaseUrl, serviceKey } = params

  // A published report is final. Regenerating over it would replace what a
  // named person signed off on; the button offers a new period instead.
  const existing = await fetch(
    `${supabaseUrl}/rest/v1/kpi_reports?period_kind=eq.${kind}&period_start=eq.${start}&select=id,status`,
    { headers: rest(serviceKey) }
  ).then((r) => (r.ok ? (r.json() as Promise<Array<{ id: string; status: string }>>) : []))
  if (existing[0]?.status === 'published') {
    throw new Error(`The ${kind} report for ${start} is published and cannot be regenerated`)
  }

  const raw = await fetchRawFactPack(supabaseUrl, serviceKey, kind, start)
  const pack = composeFactPack(raw)

  let output: ReportOutput
  let model: string | null = null
  let modelError: string | null = null
  let droppedKeys: string[] = []

  const provider = getReportProvider()
  if (provider) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    try {
      const draft = await provider.draft(pack, controller.signal)
      output = draft.output
      droppedKeys = draft.dropped_keys
      model = provider.id
    } catch (err) {
      modelError =
        err instanceof ReportProviderRateLimited
          ? `rate limited; retry after ${err.retryAfter}s`
          : err instanceof Error
            ? err.message
            : 'unknown provider failure'
      output = deterministicOutput(pack)
    } finally {
      clearTimeout(timer)
    }
  } else {
    modelError = 'no report provider configured'
    output = deterministicOutput(pack)
  }

  const row = {
    period_kind: kind,
    period_start: pack.period.start,
    period_end: pack.period.end,
    status: 'draft',
    fact_pack: pack,
    summary_md: model ? output.executive_summary_md : null,
    sections: output.sections,
    suggested_actions: output.suggested_actions,
    at_risk: output.at_risk,
    data_quality_notes: [...output.data_quality_notes, ...(modelError ? [`Commentary not generated: ${modelError}.`] : [])],
    highlights: output.highlights_md ? { markdown: output.highlights_md } : [],
    model,
    prompt_version: model ? REPORT_PROMPT_VERSION : null,
    generated_at: new Date().toISOString(),
  }

  const upsert = await fetch(`${supabaseUrl}/rest/v1/kpi_reports?on_conflict=period_kind,period_start`, {
    method: 'POST',
    headers: {
      ...rest(serviceKey),
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  })
  if (!upsert.ok) {
    throw new Error(`kpi_reports upsert ${upsert.status}: ${(await upsert.text().catch(() => '')).slice(0, 300)}`)
  }
  const [report] = (await upsert.json()) as KpiReportRow[]

  let notified: RunReportResult['notified'] = null
  if (params.notify) notified = await notifyAdmins(params, report)

  return { report, model, model_error: modelError, dropped_keys: droppedKeys, notified }
}

/**
 * The admin seats (super_admin, admin) hear that a draft is waiting. Profiles
 * carry no email; the auth admin API does, one lookup per seat, and there are
 * at most a handful of seats by construction (124).
 */
async function adminEmails(supabaseUrl: string, serviceKey: string): Promise<string[]> {
  const profiles = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id&roles=ov.{super_admin,admin}&limit=10`,
    { headers: rest(serviceKey) }
  ).then((r) => (r.ok ? (r.json() as Promise<Array<{ id: string }>>) : []))

  const emails: string[] = []
  for (const { id } of profiles) {
    const user = await fetch(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<any>) : null))
      .catch(() => null)
    const email = user?.email ?? user?.user?.email
    if (typeof email === 'string' && email.includes('@')) emails.push(email)
  }
  return emails
}

async function notifyAdmins(params: RunReportParams, report: KpiReportRow): Promise<RunReportResult['notified']> {
  const from = emailFrom()
  const key = resendKey()
  if (!from || !key) return { sent: false, to: [], reason: 'email not configured' }

  const to = await adminEmails(params.supabaseUrl, params.serviceKey)
  if (!to.length) return { sent: false, to: [], reason: 'no admin seat has an email' }

  const label = report.fact_pack?.period?.label ?? report.period_start
  const kindWord = report.period_kind === 'month' ? 'Monthly' : report.period_kind === 'quarter' ? 'Quarterly' : 'Annual'
  const counts = report.fact_pack?.status_counts
  const url = `${params.siteOrigin}/admin/analytics?tab=reports&report=${report.id}`

  const html = renderEmail({
    title: `${kindWord} report for ${label} is drafted`,
    preheader: 'Review the figures and commentary, then publish.',
    bodyHtml: `
      <p style="margin:0 0 8px;">The ${kindWord.toLowerCase()} platform report for <strong>${escapeHtml(label)}</strong> has been drafted from the readings the platform took.</p>
      ${
        counts
          ? `<p style="margin:0 0 8px;"><strong>${counts.good}</strong> KPIs on track, <strong>${counts.warn}</strong> at risk, <strong>${counts.bad}</strong> off track, <strong>${counts.none}</strong> not yet measured.</p>`
          : ''
      }
      <p style="margin:0;">${
        report.model
          ? 'The commentary and suggested actions were drafted by a model from those figures only. Nothing is sent to recipients until you review and publish it.'
          : 'Commentary was not generated for this period; the figures are complete and the narrative is blank for you to write.'
      }</p>`,
    cta: { label: 'Review the draft', url },
    footerHtml: 'You receive this because your account holds an administrator seat on KTIP.',
  })

  const result = await sendEmail({ apiKey: key, from, to, subject: `KTIP ${kindWord.toLowerCase()} report for ${label}: draft ready`, html })
  return { sent: result.sent, to, reason: result.reason }
}
