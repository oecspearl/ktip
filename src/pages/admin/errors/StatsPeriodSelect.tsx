import type { SentryStatsPeriod } from '../../../types/sentry'

const PERIOD_OPTIONS: Array<{ value: SentryStatsPeriod; label: string }> = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export function StatsPeriodSelect({
  value,
  onChange,
}: {
  value: SentryStatsPeriod
  onChange: (value: SentryStatsPeriod) => void
}) {
  return (
    <select
      aria-label="Time period"
      value={value}
      onChange={(event) => onChange(event.target.value as SentryStatsPeriod)}
      className="border-input bg-background text-foreground focus:border-ring focus:ring-ring/50 h-7 w-36 rounded-md border px-2 text-sm outline-none focus:ring-3"
    >
      {PERIOD_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
