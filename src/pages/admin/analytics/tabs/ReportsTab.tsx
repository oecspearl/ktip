import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AlertTriangle, ArrowLeft, Download, Printer, RefreshCw, Save, Send } from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { ReportList } from '../../../../components/admin/reports/ReportList'
import { ReportView } from '../../../../components/admin/reports/ReportView'
import { RecipientsPanel } from '../../../../components/admin/reports/RecipientsPanel'
import { useToast } from '../../../../contexts/ToastContext'
import {
  useGenerateKpiReport,
  useKpiReport,
  useKpiReportList,
  usePublishKpiReport,
  useUpdateKpiReport,
} from '../../../../hooks/useKpiReports'
import {
  useKpiHistory,
  useSnapshotKpis,
  startOfPeriod,
  type PeriodKind,
} from '../../../../hooks/useKpiSnapshots'
import { PLATFORM_KPIS, formatKpiValue, type KpiTable, type PlatformKpi } from '../../../../lib/kpi-catalog'
import type { KpiReportRow, ReportSection } from '../../../../lib/kpi-report-schema'
import type { HubProps } from '../hub-context'
import { SectionHeading } from './shared'

/**
 * The §14 Table 39 reporting surface, in two halves.
 *
 * The periodic REPORTS (147): drafted on the first of the period, reviewed
 * here, published by a named person, sent to the recipients list. Opening one
 * puts its id in `?report=` so a draft is a link the admin seats are emailed.
 *
 * The READINGS underneath are the weekly pulse as it was taken (132): a past
 * week renders as what it was, not as what the live pulse says now.
 */
export default function ReportsTab(_props: HubProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const reportId = searchParams.get('report')
  const open = (id: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('report', id)
    else next.delete('report')
    setSearchParams(next, { replace: false })
  }

  return (
    <div className="space-y-10">
      {reportId ? (
        <ReportDetail id={reportId} onBack={() => open(null)} />
      ) : (
        <>
          <SectionHeading title="Periodic reports" note="monthly · quarterly · annual — drafted from the readings, published by a person" />
          <ReportsIndex onOpen={open} />
        </>
      )}
      {!reportId && (
        <>
          <SectionHeading title="Readings" note="the weekly pulse and the period snapshots, as taken" />
          <PulseMatrix />
        </>
      )}
    </div>
  )
}

function ReportsIndex({ onOpen }: { onOpen: (id: string) => void }) {
  const { reports, loading, error } = useKpiReportList()
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ktip-sun-700" />
            <p className="text-sm text-ktip-sun-800">Reports could not be read: {(error as Error).message}</p>
          </div>
        )}
        {loading ? (
          <div className="h-48 animate-pulse rounded-lg border border-ktip-sand-200" />
        ) : (
          <ReportList reports={reports ?? []} onOpen={onOpen} />
        )}
      </div>
      <RecipientsPanel />
    </div>
  )
}

function ReportDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast()
  const { report, loading, error } = useKpiReport(id)
  const { save, saving } = useUpdateKpiReport()
  const { generate, generating } = useGenerateKpiReport()
  const { publish, publishing } = usePublishKpiReport()

  // Local edits until Save. The stored row is what the print view and the
  // email read, so nothing leaves the textarea without a click.
  const [draft, setDraft] = useState<KpiReportRow | null>(null)
  useEffect(() => {
    if (report) setDraft(report)
  }, [report])
  const dirty = useMemo(
    () =>
      Boolean(
        draft &&
          report &&
          (draft.summary_md !== report.summary_md || JSON.stringify(draft.sections) !== JSON.stringify(report.sections)),
      ),
    [draft, report],
  )

  if (loading || !draft) return <div className="h-64 animate-pulse rounded-lg border border-ktip-sand-200" />
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ktip-sun-700" />
        <p className="text-sm text-ktip-sun-800">This report could not be read: {(error as Error).message}</p>
      </div>
    )
  }

  const editable = draft.status === 'draft'

  const onSave = async () => {
    try {
      await save({ id: draft.id, patch: { summary_md: draft.summary_md, sections: draft.sections } })
      toast.success('Draft saved')
    } catch (err: any) {
      toast.error(err.message || 'Could not save')
    }
  }

  const onRegenerate = async () => {
    if (dirty && !window.confirm('Regenerating replaces your unsaved edits with a fresh draft. Continue?')) return
    try {
      const result = await generate({ kind: draft.period_kind, start: draft.period_start })
      toast.success(result.model ? 'Redrafted' : `Figures refreshed; no commentary (${result.model_error ?? 'no model'})`)
    } catch (err: any) {
      toast.error(err.message || 'Could not regenerate')
    }
  }

  const onPublish = async (send: boolean) => {
    if (dirty) {
      toast.error('Save your edits first, so what you publish is what you reviewed')
      return
    }
    if (!window.confirm(send ? 'Publish this report and email it to the recipients list?' : 'Publish this report? It becomes read-only.')) return
    try {
      const result = await publish({ id: draft.id, send })
      if (send) {
        toast.success(
          result.sent?.sent
            ? `Published and sent to ${result.sent.to.length} recipient${result.sent.to.length === 1 ? '' : 's'}`
            : `Published; not sent (${result.sent?.reason ?? 'unknown reason'})`,
        )
      } else toast.success('Published')
    } catch (err: any) {
      toast.error(err.message || 'Could not publish')
    }
  }

  const setSection = (table: KpiTable, value: string) =>
    setDraft((d) => {
      if (!d) return d
      const others = (d.sections ?? []).filter((s) => s.table !== table)
      const section: ReportSection = { table, commentary_md: value }
      return { ...d, sections: [...others, section] }
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-700 hover:underline">
          <ArrowLeft size={14} /> All reports
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/admin/analytics/reports/${draft.id}?print=1`} target="_blank" rel="noopener">
            <Button size="sm" variant="outline" icon={<Printer size={14} />}>
              Print / PDF
            </Button>
          </Link>
          {editable && (
            <>
              <Button size="sm" variant="outline" icon={<RefreshCw size={14} />} loading={generating} onClick={onRegenerate}>
                Regenerate
              </Button>
              <Button size="sm" variant="secondary" icon={<Save size={14} />} loading={saving} disabled={!dirty} onClick={onSave}>
                Save
              </Button>
              <Button size="sm" variant="outline" loading={publishing} onClick={() => onPublish(false)}>
                Publish
              </Button>
              <Button size="sm" icon={<Send size={14} />} loading={publishing} onClick={() => onPublish(true)}>
                Publish &amp; send
              </Button>
            </>
          )}
        </div>
      </div>

      {editable && (
        <p className="rounded-lg border border-ktip-sand-200 bg-ktip-sand-50 px-4 py-2.5 text-xs text-ktip-sand-700">
          You are reviewing a draft. The figures are the platform's readings and cannot be edited; the summary and
          section commentary can. Publishing records your name and locks the report.
        </p>
      )}

      <div className="rounded-lg border border-ktip-sand-200 bg-ktip-cream p-6">
        <ReportView
          report={draft}
          editable={editable}
          onSummaryChange={(value) => setDraft((d) => (d ? { ...d, summary_md: value } : d))}
          onSectionChange={setSection}
        />
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- readings

const PERIOD_LABELS: Record<PeriodKind, string> = {
  week: 'Weekly pulse',
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Annual',
}

function PulseMatrix() {
  const toast = useToast()
  const [periodKind, setPeriodKind] = useState<PeriodKind>('week')
  const { byPeriod, periods, loading, error } = useKpiHistory(periodKind)
  const { snapshot, loading: snapshotting } = useSnapshotKpis()
  const currentStart = useMemo(() => startOfPeriod(periodKind), [periodKind])

  // Only KPIs that could ever have been snapshotted. A Phase 3 metric nobody
  // has attested yet would otherwise be a column of em dashes.
  const columns = useMemo(
    () => PLATFORM_KPIS.filter((k) => periods.some((p) => byPeriod.get(p)?.[k.key] != null)),
    [periods, byPeriod],
  )

  const recompute = async () => {
    try {
      await snapshot({ periodKind, periodStart: currentStart })
      toast.success(`Reading taken for ${currentStart}`)
    } catch (err: any) {
      toast.error(err.message || 'Could not take the reading')
    }
  }

  const exportCsv = () => {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [['Period', ...columns.map((c) => escape(c.label))].join(',')]
    for (const period of periods) {
      const row = byPeriod.get(period) || {}
      // An unmeasured period exports as UNAVAILABLE, never as an empty cell a
      // spreadsheet will read as zero.
      lines.push([period, ...columns.map((c) => (row[c.key] == null ? 'UNAVAILABLE' : String(row[c.key])))].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ktip-${periodKind}-pulse-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-ktip-sand-300" role="group" aria-label="Reading cadence">
          {(['week', 'month', 'quarter', 'year'] as PeriodKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setPeriodKind(kind)}
              aria-pressed={periodKind === kind}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                periodKind === kind ? 'bg-ktip-ocean-500 text-white' : 'text-ktip-sand-700 hover:bg-ktip-sand-100'
              }`}
            >
              {PERIOD_LABELS[kind]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={snapshotting} onClick={recompute}>
            Recompute this period
          </Button>
          <Button size="sm" variant="outline" icon={<Download size={14} />} onClick={exportCsv} disabled={!periods.length}>
            Export CSV
          </Button>
        </div>
      </div>

      <p className="text-sm text-ktip-sand-600">
        {periods.length
          ? `${periods.length} ${periodKind}${periods.length === 1 ? '' : 's'} recorded. The current period starts ${currentStart}.`
          : `No readings yet. Take one for the period starting ${currentStart}.`}{' '}
        Readings are taken automatically each Monday by <code>/api/cron/kpi-snapshot</code>; the button is the fallback and
        the backfill path.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-ktip-sun-200 bg-ktip-sun-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ktip-sun-700" />
          <div>
            <p className="text-sm font-medium text-ktip-sun-800">History could not be read</p>
            <p className="mt-0.5 text-xs text-ktip-sun-700">{(error as Error).message}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-lg border border-ktip-sand-200" />
      ) : !periods.length ? (
        <div className="rounded-lg border border-ktip-sand-200 py-16 text-center">
          <h3 className="mb-1 text-lg font-semibold text-gray-900">No readings recorded</h3>
          <p className="mx-auto max-w-md text-sm text-gray-600">
            Point-in-time metrics cannot be reconstructed later, so a period with no reading stays blank permanently.
            Take the first one now.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ktip-sand-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ktip-sand-200 bg-ktip-sand-50">
                <th className="sticky left-0 bg-ktip-sand-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Period
                </th>
                {columns.map((kpi) => (
                  <th
                    key={kpi.key}
                    title={kpi.definitionNote}
                    className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600"
                  >
                    {kpi.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ktip-sand-200">
              {periods.map((period) => (
                <tr key={period} className="transition-colors hover:bg-ktip-sand-50/50">
                  <td className="sticky left-0 bg-ktip-cream px-4 py-3 text-sm font-medium text-gray-900">{period}</td>
                  {columns.map((kpi) => (
                    <Cell key={kpi.key} kpi={kpi} value={byPeriod.get(period)?.[kpi.key] ?? null} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ktip-sand-500">
        An em dash means the metric could not be measured in that period. It does not mean zero — see{' '}
        <code>kpi_snapshots.value</code> in migration 132.
      </p>
    </div>
  )
}

function Cell({ kpi, value }: { kpi: PlatformKpi; value: number | null }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums">
      {value === null ? <span className="text-ktip-sand-400">—</span> : <span className="text-gray-900">{formatKpiValue(value, kpi.unit)}</span>}
    </td>
  )
}
