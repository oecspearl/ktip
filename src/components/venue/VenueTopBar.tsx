import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, WifiOff } from 'lucide-react'
import { cn } from '../../lib/utils'
import { venuePath } from '../../lib/event-slug'
import { AvailabilityPicker } from './AvailabilityPicker'
import type { VenueAvailability } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface VenueTopBarProps {
  eventId: string
  /** events.slug — null on a row that predates migration 087's backfill. */
  eventSlug: string | null
  /** events.event_type — picks the canonical venue segment for the map link. */
  eventType?: string | null
  eventTitle: string
  headcount: number
  connected: boolean
  availability: VenueAvailability
  /** True when the shown availability came from the idle timer. */
  isAuto: boolean
  onAvailabilityChange: (next: Exclude<VenueAvailability, 'offline'>) => void
  /** Set when inside a room, so the bar can offer a way back to the map. */
  backToMap?: boolean
  /** Extra chrome (e.g. the organizer's "Edit the map" button), before the picker. */
  trailing?: ReactNode
  /** The floorplan page has no other h1; the room page keeps the default. */
  titleAs?: 'p' | 'h1'
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
  eventSlug,
  eventType,
  eventTitle,
  headcount,
  connected,
  availability,
  isAuto,
  onAvailabilityChange,
  backToMap,
  trailing,
  titleAs,
  className,
}: VenueTopBarProps) {
  const { t } = useLingui()
  const TitleTag = titleAs ?? 'p'

  // The presence channel lives in the venue layout and survives page swaps,
  // so `connected` is only false on first entry and on a genuine socket drop.
  // The grace window keeps the first join and sub-2s blips quiet; the chip
  // only alarms when the outage is real.
  const [outage, setOutage] = useState(false)
  useEffect(() => {
    if (connected) {
      setOutage(false)
      return
    }
    const tid = window.setTimeout(() => setOutage(true), 2_000)
    return () => window.clearTimeout(tid)
  }, [connected])

  return (
    <div
      className={cn(
        // Sticks to the navbar's bottom edge, not under it. At top-0 the bar's
        // own ~88px covered this whole row, so "Event page" was unclickable
        // exactly where the page loads — the click hit the navbar logo and went
        // to /. --nav-offset rather than --nav-h because the navbar auto-hides:
        // holding its full height while it is off screen leaves this bar
        // floating mid-page. The transition matches the navbar's own slide.
        'sticky top-[var(--nav-offset)] z-rail flex flex-wrap items-center gap-3 border-b border-ktip-sand-100 bg-ktip-cream/95 px-4 py-3 backdrop-blur-sm transition-[top] duration-300',
        className
      )}
    >
      <Link
        to={
          backToMap
            ? venuePath({ id: eventId, slug: eventSlug, event_type: eventType })
            : `/events/${eventSlug || eventId}`
        }
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ktip-ocean-600 hover:underline"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        {backToMap ? t`Back to the map` : t`Event page`}
      </Link>

      <span className="hidden h-4 w-px bg-ktip-sand-200 sm:block" aria-hidden="true" />

      <TitleTag className="min-w-0 flex-1 truncate font-display text-sm font-bold text-ktip-sand-900">
        {eventTitle}
      </TitleTag>

      {/* One chip carries both facts: the count, and whether it can be
          trusted. Live is the default state, so it earns only a dot — the
          chip changes voice only when the socket drops for real, which is the
          news. During the grace window it renders nothing at all. */}
      {(connected || outage) && (
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            connected
              ? 'border-ktip-sand-200 text-ktip-sand-600'
              : 'border-ktip-sand-200 bg-ktip-sand-100 text-ktip-sand-600'
          )}
          title={connected ? t`Live presence connected` : t`Reconnecting — headcounts may be stale`}
        >
          {connected ? (
            <span className="h-2 w-2 rounded-full bg-ktip-tropical-500" aria-hidden="true" />
          ) : (
            <WifiOff size={13} aria-hidden="true" />
          )}
          {connected ? <Trans>{headcount} here</Trans> : t`Reconnecting`}
        </span>
      )}

      {trailing}

      <AvailabilityPicker
        value={availability}
        onChange={onAvailabilityChange}
        isAuto={isAuto}
      />
    </div>
  )
}
