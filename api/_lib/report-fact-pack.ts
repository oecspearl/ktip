import {
  PLATFORM_KPIS,
  kpiProgress,
  kpiStatus,
  type KpiStatus,
  type PlatformPulse,
} from '../../src/lib/kpi-catalog'
import type { FactPack, FactPackKpi, ReportOutput, ReportPeriodKind } from '../../src/lib/kpi-report-schema'

/**
 * From the raw RPC blob (get_report_fact_pack, migration 147) to the fact
 * pack a report is drafted from.
 *
 * Status and progress are computed here with the SAME functions the console
 * tiles use — kpiProgress() and kpiStatus() from the catalog — so a KPI that
 * is amber on the Results tab is amber in the report. The model is told what
 * the status is; it never decides it.
 *
 * Pure: takes the blob, returns the pack. The fetch lives in fetchRawFactPack
 * so this can be tested with a fixture.
 */

export interface RawFactPack {
  period: { kind: ReportPeriodKind; start: string; end: string; prior_start: string; prior_end: string }
  computed_at: string
  pulse: PlatformPulse
  prior_pulse: PlatformPulse
  targets: Array<{ kpi_key: string; target_value: number | string; unit: string }>
  history: Array<{ period_start: string; kpi_key: string; value: number | string | null }>
  highlights: FactPack['highlights']
  meta: { total_members: number | null; oecs_states_flagged: number | null; roadmap_oecs_states: number }
}

export async function fetchRawFactPack(
  supabaseUrl: string,
  serviceKey: string,
  kind: ReportPeriodKind,
  start: string
): Promise<RawFactPack> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_report_fact_pack`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_period_kind: kind, p_period_start: start }),
  })
  if (!res.ok) {
    throw new Error(`get_report_fact_pack ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  }
  return (await res.json()) as RawFactPack
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function periodLabel(kind: ReportPeriodKind, start: string): string {
  const d = new Date(`${start}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return start
  if (kind === 'year') return String(d.getUTCFullYear())
  if (kind === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
  return MONTH.format(d)
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function composeFactPack(raw: RawFactPack): FactPack {
  const targets = new Map(raw.targets.map((t) => [t.kpi_key, toNumber(t.target_value)]))
  const historyByKey = new Map<string, Array<{ period_start: string; value: number | null }>>()
  for (const row of raw.history) {
    const list = historyByKey.get(row.kpi_key) ?? []
    list.push({ period_start: row.period_start, value: toNumber(row.value) })
    historyByKey.set(row.kpi_key, list)
  }

  const statusCounts: Record<KpiStatus, number> = { good: 0, warn: 0, bad: 0, none: 0 }
  const dataQuality: string[] = []

  const kpis: FactPackKpi[] = PLATFORM_KPIS.map((kpi) => {
    const measured = kpi.read(raw.pulse)
    const prior = kpi.read(raw.prior_pulse)
    const target = targets.get(kpi.key) ?? null
    const value = measured.state === 'ok' ? measured.value : null
    const priorValue = prior.state === 'ok' ? prior.value : null
    const progress =
      value !== null && target !== null && !kpi.reportedOnly ? kpiProgress(value, target, kpi.direction) : null
    const status = kpiStatus(progress)
    statusCounts[status] += 1

    const changePct =
      value !== null && priorValue !== null && priorValue !== 0
        ? Math.round(((value - priorValue) / Math.abs(priorValue)) * 1000) / 10
        : null

    return {
      key: kpi.key,
      table: kpi.table,
      label: kpi.label,
      unit: kpi.unit,
      direction: kpi.direction,
      phase: kpi.phase,
      reported_only: Boolean(kpi.reportedOnly),
      value,
      unavailable_reason:
        measured.state === 'unavailable'
          ? kpi.phase > 1
            ? `Not yet measured (phase ${kpi.phase} collector)`
            : measured.reason
          : null,
      prior_value: priorValue,
      target,
      progress,
      status,
      change_pct: changePct,
      history: historyByKey.get(kpi.key) ?? [],
    }
  })

  // The platform's own notes about its numbers. Written here, not by the
  // model, because these are facts about instrumentation the model cannot know.
  const unmeasured = kpis.filter((k) => k.value === null)
  if (unmeasured.length) {
    dataQuality.push(
      `${unmeasured.length} of ${kpis.length} KPIs have no reading for this period: ${unmeasured
        .map((k) => `${k.label} (${k.key})`)
        .join('; ')}. These are unmeasured, not zero.`
    )
  }
  const consentGated = kpis.filter((k) => k.value !== null && /reach_pct|session_minutes|p75_lcp/.test(k.key))
  if (consentGated.length) {
    dataQuality.push(
      `${consentGated.map((k) => k.label).join(', ')} are computed from consent-gated analytics events and describe consenting sessions only; they undercount by construction.`
    )
  }
  if (
    raw.meta.oecs_states_flagged !== null &&
    raw.meta.oecs_states_flagged !== raw.meta.roadmap_oecs_states
  ) {
    dataQuality.push(
      `The countries table flags ${raw.meta.oecs_states_flagged} OECS member states; the roadmap counts ${raw.meta.roadmap_oecs_states}. Regional-coverage figures use the table's denominator until the programme lead reconciles this.`
    )
  }
  const noTarget = kpis.filter((k) => k.target === null && !k.reported_only && k.phase < 3)
  if (noTarget.length) {
    dataQuality.push(`No target is set for: ${noTarget.map((k) => k.key).join(', ')}.`)
  }

  return {
    period: {
      kind: raw.period.kind,
      start: raw.period.start,
      end: raw.period.end,
      label: periodLabel(raw.period.kind, raw.period.start),
      prior_label: periodLabel(raw.period.kind, raw.period.prior_start),
    },
    computed_at: raw.computed_at,
    kpis,
    status_counts: statusCounts,
    highlights: raw.highlights,
    meta: raw.meta,
    data_quality: dataQuality,
  }
}

/**
 * The report when no model is available: the figures, grouped by table, with
 * empty commentary. A report generation must never depend on a vendor being
 * up — a blank narrative is a report; a missing row is a missed month.
 */
export function deterministicOutput(pack: FactPack): ReportOutput {
  const tables = [...new Set(pack.kpis.map((k) => k.table))]
  const atRisk = pack.kpis
    .filter((k) => k.status === 'bad' || k.status === 'warn')
    .map((k) => ({
      kpi_key: k.key,
      why: `${k.label} reads ${k.value} against a target of ${k.target} (${Math.round((k.progress ?? 0) * 100)}% of target).`,
    }))
  return {
    executive_summary_md: `Figures for ${pack.period.label}. ${pack.status_counts.good} KPIs on track, ${pack.status_counts.warn} at risk, ${pack.status_counts.bad} off track, ${pack.status_counts.none} not measured. Commentary was not generated for this period; the figures below are complete.`,
    sections: tables.map((table) => ({ table, commentary_md: '' })),
    at_risk: atRisk,
    suggested_actions: [],
    highlights_md: '',
    data_quality_notes: pack.data_quality,
  }
}
