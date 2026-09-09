import { useMemo } from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { KPI_TABLE_ORDER, KPI_TABLE_TITLES, formatKpiValue, type KpiStatus, type KpiTable } from '../../../lib/kpi-catalog'
import type { FactPackKpi, KpiReportRow, ReportSection } from '../../../lib/kpi-report-schema'
import { renderMarkdown } from '../../../lib/report-markdown'
import { STATUS_WORDS } from '../../charts/RadialTarget'
import { SuggestedActionsTable } from './SuggestedActionsTable'

const STATUS_CLASS: Record<KpiStatus, string> = {
  good: 'text-chart-good',
  warn: 'text-chart-warn',
  bad: 'text-chart-bad',
  none: 'text-ktip-sand-400',
}

interface ReportViewProps {
  report: KpiReportRow
  /** Editing mode: the narrative fields become textareas. Drafts only. */
  editable?: boolean
  onSummaryChange?: (value: string) => void
  onSectionChange?: (table: KpiTable, value: string) => void
  /** The publisher's display name, once known. */
  publishedByName?: string | null
}

const KIND_WORD = { month: 'Monthly', quarter: 'Quarterly', year: 'Annual' } as const

/**
 * One report, as it will be read — on the tab, in the print view, and in
 * substance in the email. The figures come from the stored fact pack, so a
 * report opened next year shows what was true when it was written.
 *
 * The narrative is shown beside the figures it describes, table by table,
 * and every reading that was unmeasured says so in words. The disclosure
 * line at the foot is not decoration (roadmap §7): it names the model, the
 * prompt version and the person who published.
 */
export function ReportView({ report, editable = false, onSummaryChange, onSectionChange, publishedByName }: ReportViewProps) {
  const pack = report.fact_pack
  const sectionsByTable = useMemo(() => {
    const map = new Map<KpiTable, ReportSection>()
    for (const s of report.sections ?? []) map.set(s.table, s)
    return map
  }, [report.sections])
  const kpisByTable = useMemo(() => {
    const map = new Map<KpiTable, FactPackKpi[]>()
    for (const k of pack?.kpis ?? []) map.set(k.table, [...(map.get(k.table) ?? []), k])
    return map
  }, [pack])

  const label = pack?.period?.label ?? report.period_start
  const counts = pack?.status_counts
  const highlights = Array.isArray(report.highlights) ? null : report.highlights?.markdown ?? null

  return (
    <article className="kpi-report space-y-8 text-ktip-sand-900">
      <header className="border-b border-ktip-sand-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ktip-ocean-600">
          OECS KTIP · {KIND_WORD[report.period_kind]} report · roadmap §14 Table 39
        </p>
        <h1 className="mt-1 text-2xl font-bold">{label}</h1>
        <p className="mt-1 text-sm text-ktip-sand-600">
          {pack?.period?.start} to {pack?.period?.end} (exclusive) · figures taken{' '}
          {new Date(report.generated_at).toLocaleString('en-GB')}
          {report.status === 'published' && report.published_at
            ? ` · published ${new Date(report.published_at).toLocaleDateString('en-GB')}`
            : ' · draft'}
        </p>
        {counts && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
            {(['good', 'warn', 'bad', 'none'] as KpiStatus[]).map((s) => (
              <span key={s} className={`font-semibold ${STATUS_CLASS[s]}`}>
                {counts[s]} {STATUS_WORDS[s]}
              </span>
            ))}
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ktip-sand-500">Executive summary</h2>
        {editable ? (
          <textarea
            value={report.summary_md ?? ''}
            onChange={(e) => onSummaryChange?.(e.currentTarget.value)}
            rows={8}
            placeholder="No commentary was generated for this period. Write the summary here."
            className="w-full rounded-lg border border-ktip-sand-300 bg-ktip-cream p-3 text-sm leading-relaxed text-ktip-sand-900 focus:border-ktip-ocean-500 focus:outline-none"
          />
        ) : report.summary_md ? (
          <div className="text-sm leading-relaxed sm:text-base">{renderMarkdown(report.summary_md)}</div>
        ) : (
          <p className="text-sm italic text-ktip-sand-500">
            No commentary was written for this period. The figures below are complete.
          </p>
        )}
      </section>

      {report.at_risk?.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ktip-sand-500">
            <AlertTriangle size={14} className="text-chart-warn" /> KPIs at risk
          </h2>
          <ul className="space-y-1.5 text-sm">
            {report.at_risk.map((item, i) => {
              const kpi = pack?.kpis.find((k) => k.key === item.kpi_key)
              return (
                <li key={`${item.kpi_key}-${i}`} className="flex gap-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${kpi?.status === 'bad' ? 'bg-chart-bad' : 'bg-chart-warn'}`} aria-hidden="true" />
                  <span>
                    <strong>{kpi?.label ?? item.kpi_key}</strong>
                    {kpi && kpi.value !== null && (
                      <span className="text-ktip-sand-600">
                        {' '}
                        — {formatKpiValue(kpi.value, kpi.unit)}
                        {kpi.target !== null ? ` of ${formatKpiValue(kpi.target, kpi.unit)}` : ''}
                      </span>
                    )}
                    <span className="block text-ktip-sand-700">{item.why}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ktip-sand-500">Suggested actions</h2>
        <SuggestedActionsTable actions={report.suggested_actions ?? []} />
      </section>

      {KPI_TABLE_ORDER.map((table) => {
        const kpis = kpisByTable.get(table)
        if (!kpis?.length) return null
        const section = sectionsByTable.get(table)
        return (
          <section key={table} className="break-inside-avoid">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ktip-sand-500">
              {table} · {KPI_TABLE_TITLES[table]}
            </h2>
            {editable ? (
              <textarea
                value={section?.commentary_md ?? ''}
                onChange={(e) => onSectionChange?.(table, e.currentTarget.value)}
                rows={3}
                placeholder={`Commentary on ${KPI_TABLE_TITLES[table].toLowerCase()} (optional)`}
                className="mb-3 w-full rounded-lg border border-ktip-sand-300 bg-ktip-cream p-3 text-sm leading-relaxed text-ktip-sand-900 focus:border-ktip-ocean-500 focus:outline-none"
              />
            ) : (
              section?.commentary_md && <div className="mb-3 text-sm leading-relaxed">{renderMarkdown(section.commentary_md)}</div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-ktip-sand-200 text-left text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
                    <th className="py-1.5 pr-3">Indicator</th>
                    <th className="py-1.5 pr-3 text-right">Reading</th>
                    <th className="py-1.5 pr-3 text-right">Previous</th>
                    <th className="py-1.5 pr-3 text-right">Target</th>
                    <th className="py-1.5 pr-3 text-right">Progress</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ktip-sand-100">
                  {kpis.map((k) => (
                    <tr key={k.key}>
                      <td className="py-1.5 pr-3 text-ktip-sand-800">
                        {k.label}
                        {k.reported_only && <span className="ml-1 text-xs text-ktip-sand-400">(reported)</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-semibold">
                        {k.value === null ? <span className="font-normal text-ktip-sand-400">unmeasured</span> : formatKpiValue(k.value, k.unit)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ktip-sand-600">
                        {k.prior_value === null ? '—' : formatKpiValue(k.prior_value, k.unit)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ktip-sand-600">
                        {k.target === null ? '—' : formatKpiValue(k.target, k.unit)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-ktip-sand-600">
                        {k.progress === null ? '—' : `${Math.round(k.progress * 100)}%`}
                      </td>
                      <td className={`py-1.5 text-xs font-semibold ${STATUS_CLASS[k.status]}`}>
                        {k.value === null ? (k.phase > 1 ? `not yet measured (phase ${k.phase})` : 'unmeasured') : STATUS_WORDS[k.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      {(highlights || (pack?.highlights && (pack.highlights.projects.length || pack.highlights.events.length || pack.highlights.resources.length))) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ktip-sand-500">Highlights</h2>
          {highlights && <div className="mb-3 text-sm leading-relaxed">{renderMarkdown(highlights)}</div>}
          {pack?.highlights && (
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              {(
                [
                  ['New public projects', pack.highlights.projects.map((p) => p.title)],
                  ['Events held', pack.highlights.events.map((e) => e.title)],
                  ['Resources published', pack.highlights.resources.map((r) => r.title)],
                ] as Array<[string, string[]]>
              ).map(([title, items]) => (
                <div key={title}>
                  <p className="text-xs font-semibold text-ktip-sand-500">{title}</p>
                  {items.length ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ktip-sand-800">
                      {items.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-ktip-sand-400">none this period</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {(report.data_quality_notes?.length > 0 || pack?.data_quality?.length > 0) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ktip-sand-500">About these figures</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ktip-sand-700">
            {[...new Set([...(pack?.data_quality ?? []), ...(report.data_quality_notes ?? [])])].map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex items-start gap-2 border-t border-ktip-sand-200 pt-3 text-xs text-ktip-sand-500">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-ktip-ocean-500" />
        <p>
          {report.model
            ? `Commentary drafted by an AI model (${report.model}, prompt ${report.prompt_version}) from aggregate platform figures only — never a member record. `
            : 'No AI model contributed to this report. '}
          Statuses are computed by the platform, not the model.{' '}
          {report.status === 'published'
            ? `Reviewed and published by ${publishedByName ?? 'an administrator'} on ${
                report.published_at ? new Date(report.published_at).toLocaleDateString('en-GB') : '—'
              }.`
            : 'This is a draft; nothing is sent until an administrator publishes it.'}
        </p>
      </footer>
    </article>
  )
}
