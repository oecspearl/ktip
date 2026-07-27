import { Button } from '../../ui/Button'
import { Download } from 'lucide-solid'
import type { AnalyticsData } from '../../../hooks/useAdminAnalytics'

interface ExportButtonProps {
  analytics: AnalyticsData | undefined
}

export function ExportButton(props: ExportButtonProps) {
  const exportCSV = () => {
    const data = props.analytics
    if (!data) return

    const lines: string[] = []
    lines.push('Category,Label,Count')

    data.usersByRole.forEach((d) => lines.push(`Users by Role,${d.label},${d.count}`))
    data.usersByCountry.forEach((d) => lines.push(`Users by Country,${d.label},${d.count}`))
    data.projectsByCategory.forEach((d) => lines.push(`Projects by Category,${d.label},${d.count}`))
    data.projectsByPhase.forEach((d) => lines.push(`Projects by Phase,${d.label},${d.count}`))
    data.eventsByType.forEach((d) => lines.push(`Events by Type,${d.label},${d.count}`))
    data.grantPipeline.forEach((d) => lines.push(`Grant Pipeline,${d.label},${d.count}`))
    data.userGrowth.forEach((d) => lines.push(`User Growth,${d.month},${d.count}`))

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
      disabled={!props.analytics}
    >
      Export CSV
    </Button>
  )
}
