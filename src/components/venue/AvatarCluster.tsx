import { cn, generateAvatarColor, getInitials } from '../../lib/utils'
import { VENUE_AVAILABILITY_DOT_COLORS } from '../../lib/constants'
import type { VenueOccupant } from '../../types'

interface AvatarClusterProps {
  occupants: VenueOccupant[]
  overflow?: number
  size?: 'sm' | 'md'
  onSelect?: (userId: string) => void
  className?: string
}

const SIZES = {
  sm: { box: 'h-6 w-6', text: 'text-[9px]', dot: 'h-2 w-2' },
  md: { box: 'h-8 w-8', text: 'text-[11px]', dot: 'h-2.5 w-2.5' },
}

/**
 * Overlapping avatars for a room zone or a compact list, with a "+N" chip.
 *
 * Capped by the caller (clusterForRoom) rather than here, because the cap is a
 * layout decision the floorplan owns — a zone is ~120px wide and forty avatars
 * in it is a smear.
 */
export function AvatarCluster({
  occupants,
  overflow = 0,
  size = 'md',
  onSelect,
  className,
}: AvatarClusterProps) {
  const s = SIZES[size]

  return (
    <div className={cn('flex items-center', className)}>
      {occupants.map((o) => {
        const name = o.display_name || 'Member'
        const dot = VENUE_AVAILABILITY_DOT_COLORS[o.availability] || 'bg-ktip-sand-300'

        const inner = (
          <>
            {o.avatar_url ? (
              <img
                src={o.avatar_url}
                alt={name}
                loading="lazy" decoding="async" className={cn('rounded-full object-cover ring-2 ring-ktip-cream', s.box)}
              />
            ) : (
              <span
                className={cn(
                  'flex items-center justify-center rounded-full font-bold text-white ring-2 ring-ktip-cream',
                  s.box,
                  s.text,
                  generateAvatarColor(name)
                )}
                aria-hidden="true"
              >
                {getInitials(name)}
              </span>
            )}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-ktip-cream',
                s.dot,
                dot
              )}
              aria-hidden="true"
            />
          </>
        )

        return onSelect ? (
          <button
            key={o.user_id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onSelect(o.user_id)
            }}
            title={name}
            aria-label={name}
            className="relative -ml-2 first:ml-0 transition-transform hover:z-10 hover:-translate-y-0.5"
          >
            {inner}
          </button>
        ) : (
          <span
            key={o.user_id}
            title={name}
            className="relative -ml-2 first:ml-0"
          >
            {inner}
            <span className="sr-only">{name}</span>
          </span>
        )
      })}

      {overflow > 0 && (
        <span
          className={cn(
            'relative -ml-2 flex items-center justify-center rounded-full bg-ktip-sand-200 font-semibold text-ktip-sand-700 ring-2 ring-ktip-cream',
            s.box,
            s.text
          )}
        >
          +{overflow}
          <span className="sr-only">and {overflow} more</span>
        </span>
      )}
    </div>
  )
}
