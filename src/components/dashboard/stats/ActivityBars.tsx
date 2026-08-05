import { Trans } from '@lingui/react/macro'

interface ActivityBarsProps {
  /** `YYYY-MM` buckets, oldest first */
  data: { month: string; count: number }[]
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function formatMonth(month: string): string {
  const [, m] = month.split('-')
  return MONTH_NAMES[parseInt(m, 10) - 1] ?? ''
}

/**
 * Things this member started, month by month.
 *
 * Same percent-height idiom as the admin GrowthChart, minus the year suffix
 * and the count label above each bar — six buckets in a bento cell has no room
 * for either, and the tooltip carries the exact number.
 */
export function ActivityBars({ data }: ActivityBarsProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0)

  if (!total) {
    return (
      <p className="text-sm italic text-ktip-sand-500">
        <Trans>Nothing started in the last six months.</Trans>
      </p>
    )
  }

  const max = Math.max(...data.map((d) => d.count)) || 1

  return (
    <div className="flex h-28 items-end gap-1.5">
      {data.map((item) => {
        // Floor at 4% so an empty month still reads as a bucket, not a gap
        const pct = item.count ? Math.max(8, Math.round((item.count / max) * 100)) : 4
        return (
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1" key={item.month}>
            <div
              className={`w-full rounded-t-md transition-all duration-500 ${
                item.count ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-200'
              }`}
              style={{ height: `${pct}%` }}
              title={`${formatMonth(item.month)}: ${item.count}`}
            />
            <span className="w-full truncate text-center text-[10px] text-ktip-sand-400">
              {formatMonth(item.month)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
