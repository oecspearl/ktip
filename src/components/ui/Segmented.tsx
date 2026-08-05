import { cn } from '../../lib/utils'

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  /** Names the group for screen readers — there is no visible label */
  label: string
  /**
   * Corner radius for the track and its thumbs. The soft-UI default suits the
   * calendar's tall chrome; a squarer corner reads better on a short one-line
   * control sitting beside plain text links.
   */
  radius?: 'neu' | 'sm'
  className?: string
}

const RADIUS = {
  neu: { track: 'rounded-neu-sm', item: 'rounded-neu-sm' },
  sm: { track: 'rounded-md', item: 'rounded-[0.3rem]' },
} as const

/**
 * Segmented control: an inset track with the active option raised out of it.
 *
 * Generic over the option list rather than a fixed count, so the same control
 * covers the calendar's four views and the dashboard's five feed categories.
 * The hero's variant on Discover cannot be shared — its sliding thumb is sized
 * `(100% - 0.5em)/3`, hardcoded to exactly three segments.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  radius = 'neu',
  className,
}: SegmentedProps<T>) {
  const corner = RADIUS[radius]

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex items-center gap-0.5 bg-ktip-sand-100 p-0.5 shadow-neu-sm-inset',
        corner.track,
        className
      )}
    >
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'px-2.5 py-1 text-micro font-bold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
              corner.item,
              active
                ? 'bg-ktip-cream text-ktip-ocean-700 shadow-neu-sm'
                : 'text-ktip-sand-600 hover:text-ktip-ocean-700'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
