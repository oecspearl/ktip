import { cn } from '../../lib/utils'
import { VENUE_AVAILABILITY_DOT_COLORS } from '../../lib/constants'
import type { VenueOccupant } from '../../types'
import { DiamondAvatar } from '../ui/DiamondAvatar'

interface AvatarClusterProps {
  occupants: VenueOccupant[]
  overflow?: number
  size?: 'sm' | 'md'
  onSelect?: (userId: string) => void
  className?: string
}

const SIZES = {
  sm: { box: 24, text: 'text-[9px]', dot: 'h-2 w-2' },
  md: { box: 32, text: 'text-[11px]', dot: 'h-2.5 w-2.5' },
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

        return (
          <DiamondAvatar
            key={o.user_id}
            src={o.avatar_url}
            name={name}
            size={s.box}
            title={name}
            onClick={onSelect ? () => onSelect(o.user_id) : undefined}
            className="-ml-2 first:ml-0 transition-transform hover:z-10 hover:-translate-y-0.5"
            frameClassName="ring-2 ring-ktip-cream"
          >
            {/* On the lower-right edge rather than the corner: a diamond has no
                corner there, so a -bottom-0.5 -right-0.5 dot would float in
                the gap beside the tip. */}
            <span
              className={cn('absolute bottom-[12%] right-[12%] rounded-full ring-2 ring-ktip-cream', s.dot, dot)}
              aria-hidden="true"
            />
          </DiamondAvatar>
        )
      })}

      {overflow > 0 && (
        <span
          className={cn(
            'relative -ml-2 flex items-center justify-center rounded-full bg-ktip-sand-200 font-semibold text-ktip-sand-700 ring-2 ring-ktip-cream',
            size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
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
