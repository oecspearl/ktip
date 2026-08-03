import { useState, type ReactNode } from 'react'
import { Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { RoomOccupantList } from './RoomOccupantList'
import type { VenueOccupant } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface VenuePresencePanelProps {
  /** Everyone in the venue who is not inside a room. */
  occupants: VenueOccupant[]
  /** Extra floating cards stacked under the list (room brief, unmapped rooms). */
  children?: ReactNode
  className?: string
}

/**
 * The "who is here" stack, floating over the map rather than beside it.
 *
 * The map is the page on the floorplan view, so the people list gives way to
 * it: collapsed it is a headcount pill, expanded it is a translucent card that
 * never blocks the floor underneath — the wrapper swallows no pointer events,
 * each child opts back in.
 */
export function VenuePresencePanel({ occupants, children, className }: VenuePresencePanelProps) {
  const { t } = useLingui()
  // Open where there is room to spare, a pill where the map needs every pixel.
  // Plain state: which way it is flipped is not worth remembering across visits.
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches
  )

  return (
    <div
      data-tutorial="venue-presence"
      className={cn(
        // The explorer's own controls all sit top-left, so the right edge is
        // this panel's from the top down.
        'pointer-events-none absolute bottom-3 right-3 top-3 z-raised flex w-72 max-w-[calc(100%-1.5rem)] flex-col items-end gap-3',
        className
      )}
    >
      {open ? (
        <RoomOccupantList
          occupants={occupants}
          title={t`In the venue`}
          emptyLabel={t`Everyone is inside a room.`}
          onCollapse={() => setOpen(false)}
          className="pointer-events-auto min-h-0 w-full shrink overflow-y-auto bg-ktip-cream/95 backdrop-blur"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-ktip-sand-200 bg-ktip-cream/95 px-3 py-1.5 text-xs font-semibold text-ktip-sand-700 shadow-card backdrop-blur transition-transform hover:-translate-y-0.5"
        >
          <Users size={13} aria-hidden="true" />
          <Trans>In the venue · {occupants.length}</Trans>
        </button>
      )}

      {children}
    </div>
  )
}
