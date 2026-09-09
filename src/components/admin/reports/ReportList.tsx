import { useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { Button } from '../../ui/Button'
import { useToast } from '../../../contexts/ToastContext'
import { useGenerateKpiReport, type KpiReportSummary } from '../../../hooks/useKpiReports'
import type { ReportPeriodKind } from '../../../lib/kpi-report-schema'
import { periodFor } from '../../../pages/admin/analytics/analytics-filters'

const KIND_WORD = { month: 'Monthly', quarter: 'Quarterly', year: 'Annual' } as const

function labelFor(kind: ReportPeriodKind, start: string): string {
  const d = new Date(`${start}T00:00:00Z`)
  if (kind === 'year') return String(d.getUTCFullYear())
  if (kind === 'quarter') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

interface ReportListProps {
  reports: ReadonlyArray<KpiReportSummary>
  onOpen: (id: string) => void
}

/**
 * Every report, newest first, and the form that drafts a new one.
 *
 * The scheduled job writes the monthly and quarterly rows; the form is the
 * manual path — for the annual report, which has no schedule, and for a
 * period that needs redoing. Generating over a published report is refused
 * by the server, which the form says up front.
 */
export function ReportList({ reports, onOpen }: ReportListProps) {
  const toast = useToast()
  const { generate, generating } = useGenerateKpiReport()
  const [kind, setKind] = useState<ReportPeriodKind>('month')
  const [offset, setOffset] = useState(1)

  const period = periodFor({ period: kind, offset, from: null, to: null })
  const existing = reports.find((r) => r.period_kind === kind && r.period_start === period.start)

  const run = async () => {
    try {
      const result = await generate({ kind, start: period.start })
      toast.success(
        result.model
          ? `Draft ready for ${labelFor(kind, period.start)}`
          : `Figures ready for ${labelFor(kind, period.start)}; no commentary (${result.model_error ?? 'no model'})`,
      )
      onOpen(result.report.id)
    } catch (err: any) {
      toast.error(err.message || 'Could not generate the report')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-ktip-sand-200 bg-ktip-cream p-4">
        <div>
          <label htmlFor="report-kind" className="block text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            Report
          </label>
          <select
            id="report-kind"
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value as ReportPeriodKind)}
            className="mt-1 rounded-md border border-ktip-sand-300 bg-ktip-cream px-2 py-1.5 text-sm"
          >
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Annual</option>
          </select>
        </div>
        <div>
          <label htmlFor="report-period" className="block text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
            Period
          </label>
          <select
            id="report-period"
            value={offset}
            onChange={(e) => setOffset(Number(e.currentTarget.value))}
            className="mt-1 rounded-md border border-ktip-sand-300 bg-ktip-cream px-2 py-1.5 text-sm"
          >
            {Array.from({ length: 8 }, (_, i) => i).map((o) => {
              const p = periodFor({ period: kind, offset: o, from: null, to: null })
              return (
                <option key={o} value={o}>
                  {p.label}
                  {o === 0 ? ' (in progress)' : ''}
                </option>
              )
            })}
          </select>
        </div>
        <Button
          onClick={run}
          loading={generating}
          disabled={existing?.status === 'published'}
          icon={<Plus size={14} />}
          size="sm"
        >
          {existing ? (existing.status === 'published' ? 'Published — final' : 'Regenerate draft') : 'Generate draft'}
        </Button>
        <p className="basis-full text-xs text-ktip-sand-500">
          Monthly and quarterly reports are drafted automatically on the first of the period. Use this for
          the annual report, a missed period, or to redraft. A published report is final.
        </p>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-ktip-sand-200 py-12 text-center">
          <FileText size={24} className="mx-auto mb-2 text-ktip-sand-400" />
          <p className="text-sm text-ktip-sand-600">No reports yet. The first monthly draft arrives on the 1st; or generate one above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ktip-sand-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ktip-sand-200 bg-ktip-sand-50 text-left text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
                <th className="px-4 py-2.5">Period</th>
                <th className="px-4 py-2.5">Kind</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Drafted</th>
                <th className="px-4 py-2.5">Commentary</th>
                <th className="px-4 py-2.5 text-right">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ktip-sand-100">
              {reports.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  className="cursor-pointer transition-colors hover:bg-ktip-sand-50"
                >
                  <td className="px-4 py-2.5 font-medium text-ktip-sand-900">
                    <button type="button" className="text-left hover:underline" onClick={() => onOpen(r.id)}>
                      {labelFor(r.period_kind, r.period_start)}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-ktip-sand-700">{KIND_WORD[r.period_kind]}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.status === 'published' ? 'bg-chart-good/10 text-chart-good' : 'bg-chart-warn/10 text-chart-warn'
                      }`}
                    >
                      {r.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ktip-sand-600">{new Date(r.generated_at).toLocaleString('en-GB')}</td>
                  <td className="px-4 py-2.5 text-xs text-ktip-sand-600">{r.model ? `${r.model} · ${r.prompt_version}` : 'figures only'}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-ktip-sand-600">
                    {r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
