import { Button } from '../../ui/Button'
import { Download } from 'lucide-react'
import type { AnalyticsData } from '../../../hooks/useAdminAnalytics'
import type { MeasuredList } from '../../../lib/measured'

interface ExportButtonProps {
  analytics: AnalyticsData | undefined
}

/**
 * A country name or a failure message can contain a comma, and one unquoted
 * comma shifts every column after it. The labels come from the database, so
 * this is not hypothetical.
 */
function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function ExportButton({ analytics }: ExportButtonProps) {
  const exportCSV = () => {
    const data = analytics
    if (!data) return

    const lines: string[] = []
    lines.push('Category,Label,Count')

    // A series that failed exports one explicit UNAVAILABLE row rather than
    // nothing. A CSV that silently omits a broken section is worse than the
    // dashboard was: the reader cannot even see that something is missing, and
    // this file is what gets attached to a report.
    const push = <T,>(
      section: string,
      list: MeasuredList<T>,
      row: (item: T) => string
    ) => {
      if (list.state === 'unavailable') {
        lines.push(`${section},UNAVAILABLE,${escapeCell(list.reason)}`)
        return
      }
      list.items.forEach((item) => lines.push(row(item)))
    }

    push(
      'Users by Role',
      data.usersByRole,
      (d) => `Users by Role,${escapeCell(d.label)},${d.count}`
    )
    push(
      'Users by Country',
      data.usersByCountry,
      (d) => `Users by Country,${escapeCell(d.label)},${d.count}`
    )
    push(
      'Projects by Category',
      data.projectsByCategory,
      (d) => `Projects by Category,${escapeCell(d.label)},${d.count}`
    )
    push(
      'Projects by Phase',
      data.projectsByPhase,
      (d) => `Projects by Phase,${escapeCell(d.label)},${d.count}`
    )
    push(
      'Events by Type',
      data.eventsByType,
      (d) => `Events by Type,${escapeCell(d.label)},${d.count}`
    )
    push(
      'Grant Pipeline',
      data.grantPipeline,
      (d) => `Grant Pipeline,${escapeCell(d.label)},${d.count}`
    )
    push('User Growth', data.userGrowth, (d) => `User Growth,${escapeCell(d.month)},${d.count}`)

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ktip-analytics-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      icon={<Download size={14} />}
      onClick={exportCSV}
      disabled={!analytics}
    >
      Export CSV
    </Button>
  )
}
