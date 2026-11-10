import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Map as MapIcon } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { format } from 'date-fns'
import { Button } from '../ui/Button'
import { DetailActionCard } from '../detail/DetailActionCard'
import type { EventPhase } from '../../lib/event-timing'
import type { ShareTarget } from '../../lib/share/targets'

/**
 * The one place on an event page where a visitor acts: where the event stands,
 * the way into the venue, registration, and the Share button.
 *
 * Pinned beside the content on wide screens and placed above it on phones, so
 * "Enter the venue" never sits below the fold. Registration state and handlers
 * stay with the page; this card only arranges what it is handed. The frame is
 * the shared DetailActionCard, which funding and project pages use too.
 */
export function EventActionCard({
  phase,
  cancelled,
  start,
  end,
  venueHref,
  approved,
  isOrganizer,
  shareTarget,
  organizerTools,
  registration,
  attendeeLine,
}: {
  phase: EventPhase
  cancelled: boolean
  start: Date
  end: Date
  /** Null when the event has no venue. */
  venueHref: string | null
  /** Registered and let in by the organizer. */
  approved: boolean
  isOrganizer: boolean
  /** Null hides Share: drafts and suspended events can't be passed on. */
  shareTarget: ShareTarget | null
  organizerTools?: ReactNode
  registration: ReactNode
  attendeeLine: ReactNode
}) {
  const { t } = useLingui()

  const status = cancelled
    ? { title: t`This event was cancelled`, sub: null }
    : phase === 'live'
      ? { title: t`Happening now`, sub: t`Ends ${format(end, 'MMM d')} at ${format(end, 'h:mm a')}` }
      : phase === 'upcoming'
        ? { title: t`Coming up`, sub: t`Starts ${format(start, 'EEE, MMM d')} at ${format(start, 'h:mm a')}` }
        : { title: t`This event has ended`, sub: null }

  // The venue stays open to its host after the event, for recaps and cleanup.
  const showVenue = !!venueHref && !cancelled && (phase !== 'past' || isOrganizer)
  const venueIsTheAction = phase === 'live' && (approved || isOrganizer)

  return (
    // The tour anchor is written out on a wrapper, not passed to the card:
    // the tutorial registry test looks for the literal attribute.
    <div data-tutorial="event-registration">
    {/* No "registered" badge in the title: the registration block already says
        where the visitor stands, in more detail. */}
    <DetailActionCard
      ownerLabel={<Trans>Your event</Trans>}
      ownerTools={organizerTools}
      title={status.title}
      sub={status.sub}
      footer={attendeeLine}
      share={shareTarget}
    >
      {showVenue && (
        <Link to={venueHref!} className="block" data-tutorial="event-venue-door">
          <Button
            fullWidth
            variant={venueIsTheAction ? 'primary' : 'outline'}
            icon={<MapIcon size={16} />}
            tabIndex={-1}
          >
            <Trans>Enter the venue</Trans>
          </Button>
        </Link>
      )}

      {registration}
    </DetailActionCard>
    </div>
  )
}
