import { cn } from '../../lib/utils'
import { VENUE_AVAILABILITY_DOT_COLORS, VENUE_AVAILABILITY_LABELS } from '../../lib/constants'
import type { VenueAvailability } from '../../types'

interface AvailabilityDotProps {
  availability: VenueAvailability
  size?: 'sm' | 'md'
  /** Render the label as visible text beside the dot. */
  withLabel?: boolean
  className?: string
}

/**
 * The green/grey/red dot.
 *
 * Colour never carries the meaning on its own: every dot ships a `title` and an
 * sr-only label. "Green versus grey" is invisible to a significant share of
 * members, and availability is the single most consequential thing the venue
 * communicates.
 */
export function AvailabilityDot({
  availability,
  size = 'md',
  withLabel = false,
  className,
}: AvailabilityDotProps) {
  const label = VENUE_AVAILABILITY_LABELS[availability] || availability
  const dot = VENUE_AVAILABILITY_DOT_COLORS[availability] || 'bg-ktip-sand-300'

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-block rounded-full ring-2 ring-ktip-cream',
          size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
          dot
        )}
        title={label}
        aria-hidden="true"
      />
      {withLabel ? (
        <span className="text-xs text-ktip-sand-600">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  )
}
