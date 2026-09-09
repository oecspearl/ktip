import { useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { ReportView } from '../../../components/admin/reports/ReportView'
import { useKpiReport } from '../../../hooks/useKpiReports'

/**
 * A report on its own page, for the print dialog.
 *
 * "Download PDF" everywhere on KTIP is the browser's print-to-PDF — the same
 * path SubmissionReceiptPage uses — so there is no PDF library to keep in
 * step with the on-screen rendering. `?print=1` opens the dialog once the
 * report is on the page; printing an empty document is worse than not
 * printing.
 *
 * The print stylesheet hides everything but the report: the admin rail and
 * the hero are chrome, and a page of chrome around three pages of figures
 * is how a PDF ends up looking like a screenshot.
 */
export default function ReportPrintPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { report, loading, error } = useKpiReport(id ?? null)

  const printed = useRef(false)
  useEffect(() => {
    if (printed.current || !report) return
    if (searchParams.get('print') !== '1') return
    printed.current = true
    const timer = window.setTimeout(() => window.print(), 150)
    return () => window.clearTimeout(timer)
  }, [report, searchParams])

  return (
    <>
      <style>{`@media print {
        body * { visibility: hidden; }
        .kpi-report-print, .kpi-report-print * { visibility: visible; }
        .kpi-report-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
        .kpi-report-print .print-hide { display: none; }
      }`}</style>
      <div className="kpi-report-print mx-auto w-full max-w-4xl px-4 py-6">
        <div className="print-hide mb-4 flex items-center justify-between gap-3 print:hidden">
          <Link
            to={report ? `/admin/analytics?tab=reports&report=${report.id}` : '/admin/analytics?tab=reports'}
            className="inline-flex items-center gap-1 text-sm font-medium text-ktip-ocean-700 hover:underline"
          >
            <ArrowLeft size={14} /> Back to the report
          </Link>
          <Button size="sm" variant="secondary" icon={<Printer size={14} />} onClick={() => window.print()} disabled={!report}>
            Print / Save as PDF
          </Button>
        </div>
        {loading && <div className="h-64 animate-pulse rounded-lg border border-ktip-sand-200" />}
        {error && <p className="text-sm text-ktip-sun-800">This report could not be read: {(error as Error).message}</p>}
        {report && <ReportView report={report} />}
      </div>
    </>
  )
}
