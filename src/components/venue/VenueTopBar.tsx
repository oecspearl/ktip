import { Link } from 'react-router'
import { ArrowLeft, Radio, Users, WifiOff } from 'lucide-react'
import { cn } from '../../lib/utils'
import { VENUE_ROLE_LABELS } from '../../lib/constants'
import { AvailabilityPicker } from './AvailabilityPicker'
import type { VenueAvailability, VenueRole } from '../../types'

interface VenueTopBarProps {
  eventId: string
  eventTitle: string
  role: VenueRole
  headcount: number
  connected: boolean
  availability: VenueAvailability
  /** True when the shown availability came from the idle timer. */
  isAuto: boolean
  onAvailabilityChange: (next: Exclude<VenueAvailability, 'offline'>) => void
  /** Set when inside a room, so the bar can offer a way back to the map. */
  backToMap?: boolean
  className?: string
}

/**
 * Sticky venue chrome: where you are, who is here, whether the presence channel
 * is actually connected, and your own status.
 *
 * The connection state is shown rather than hidden. Presence is the whole
 * mechanism behind every number on the floorplan, so when the socket drops, the
 * honest thing is to say the numbers are stale — not to render a confident zero.
 */
export function VenueTopBar({
  eventId,
  eventTitle,
  role,
  headcount,
  connected,
  availability,
  isAuto,
  onAvailabilityChange,
  backToMap,
  className,
}: VenueTopBarProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-ktip-sand-100 bg-ktip-cream/95 px-4 py-3 backdrop-blur-sm',
        className
      )}
    >
      <Link
        to={backToMap ? `/events/${eventId}/venue` : `/events/${eventId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ktip-ocean-600 hover:underline"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        {backToMap ? 'Back to the map' : 'Event page'}
      </Link>

      <span className="hidden h-4 w-px bg-ktip-sand-200 sm:block" aria-hidden="true" />

      <p className="min-w-0 flex-1 truncate font-display text-sm font-bold text-ktip-sand-900">
        {eventTitle}
      </p>

      <span className="flex items-center gap-1.5 rounded-full border border-ktip-sand-200 px-2.5 py-1 text-xs font-medium text-ktip-sand-600">
        <Users size={13} aria-hidden="true" />
        {headcount} here
      </span>

      <span
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
          connected
            ? 'border-ktip-tropical-200 bg-ktip-tropical-100 text-ktip-tropical-800'
            : 'border-ktip-sand-200 bg-ktip-sand-100 text-ktip-sand-600'
        )}
        title={connected ? 'Live presence connected' : 'Reconnecting — headcounts may be stale'}
      >
        {connected ? (
          <Radio size={13} aria-hidden="true" />
        ) : (
          <WifiOff size={13} aria-hidden="true" />
        )}
        {connected ? 'Live' : 'Reconnecting'}
      </span>

      {role !== 'participant' && (
        <span className="rounded-full border border-ktip-ocean-200 bg-ktip-ocean-50 px-2.5 py-1 text-xs font-medium text-ktip-ocean-700">
          {VENUE_ROLE_LABELS[role] || role}
        </span>
      )}

      <AvailabilityPicker
        value={availability}
        onChange={onAvailabilityChange}
        isAuto={isAuto}
      />
    </div>
  )
}
