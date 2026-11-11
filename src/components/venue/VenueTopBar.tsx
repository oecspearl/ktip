import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, ChevronRight, Map as MapIcon, Timer, WifiOff } from 'lucide-react'
import { cn } from '../../lib/utils'
import { venuePath } from '../../lib/event-slug'
import { IrisLink } from '../ui/IrisTransition'
import { AvailabilityPicker } from './AvailabilityPicker'
import { clockLeft, useNowUntil } from './room/judging/judging-time'
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
  /** events.submission_deadline. Set, the bar counts down to it. */
  submissionDeadline?: string | null
  /** Set when inside a room, so the bar can offer a way back to the map. */
  backToMap?: boolean
  /**
   * Inside a room: the trail "Venue map / Event / Floor › Room" replaces the
   * plain back link (the room revamp's design, 2026-11-10).
   */
  crumbs?: { floor: string | null; room: string }
  /** Extra chrome (e.g. the organizer's "Edit the map" button), before the picker. */
  trailing?: ReactNode
  /** The floorplan page has no other h1; the room page keeps the default. */
  titleAs?: 'p' | 'h1'
  className?: string
}

/**
 * "Submissions close in 18:41:24", ticking. Its own component so the per-second
 * render stays inside this chip rather than the whole bar. Gold digits on a
 * fixed navy chip: that pairing holds in both themes, which gold on the cream
 * bar would not.
 */
/**
 * Back to wherever this member came from: the map, another room, the event
 * page. Someone who opened the room from a link has nowhere to go back to, so
 * for them it goes to the map.
 */
function RoomBackButton({ fallback }: { fallback: string }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        // React Router keeps its own position in history.state; 0 is the first
        // page of this visit.
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
        if (idx > 0) navigate(-1)
        else navigate(fallback)
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-ktip-sand-200 bg-ktip-cream px-2.5 font-bold text-ktip-sand-800 transition-colors hover:border-ktip-ocean-400 hover:text-ktip-ocean-700"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      {t`Back`}
    </button>
  )
}

function SubmissionCountdown({ deadline }: { deadline: string }) {
  const { i18n } = useLingui()
  const end = Date.parse(deadline)
  const now = useNowUntil(end)
  if (!Number.isFinite(end)) return null
  const left = end - now
  const at = i18n.date(new Date(end), { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <span
      title={at}
      className="flex items-center gap-2 rounded-full bg-brand-navy px-3 py-1 text-xs font-medium text-white ring-1 ring-ktip-sun-200"
    >
      <Timer size={14} className="shrink-0 text-ktip-sun-600" aria-hidden="true" />
      {left > 0 ? (
        // role="timer" is polite by default: read on focus, not every second.
        <span role="timer">
          <span className="sr-only sm:not-sr-only">
            <Trans>Submissions close in</Trans>{' '}
          </span>
          <time
            dateTime={new Date(end).toISOString()}
            className="font-display text-base font-bold tabular-nums text-ktip-sun-600"
          >
            {clockLeft(left)}
          </time>
        </span>
      ) : (
        <Trans>Submissions closed</Trans>
      )}
    </span>
  )
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
  submissionDeadline,
  backToMap,
  crumbs,
  trailing,
  titleAs,
  className,
}: VenueTopBarProps) {
  const { t } = useLingui()
  const TitleTag = titleAs ?? 'p'
  // Back to the map goes through the iris, the same door the room was entered by.
  const BackLink = backToMap ? IrisLink : Link

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
      // Solid cream instead of blurred glass on mobile-lite (index.css).
      data-lite-solid
      className={cn(
        // Sticks to the navbar's bottom edge, not under it. At top-0 the bar's
        // own ~88px covered this whole row, so "Event page" was unclickable
        // exactly where the page loads — the click hit the navbar logo and went
        // to /. --nav-offset rather than --nav-h because the navbar auto-hides:
        // holding its full height while it is off screen leaves this bar
        // floating mid-page. The transition matches the navbar's own slide.
        'sticky top-[var(--nav-offset)] z-rail flex flex-wrap items-center gap-3 border-b border-ktip-sand-100 bg-ktip-cream/95 px-4 py-3 backdrop-blur-sm transition-[top] duration-300 [--lite-solid:var(--color-ktip-cream)]',
        className
      )}
    >
      {backToMap && crumbs ? (
        <nav aria-label={t`Breadcrumb`} className="min-w-0 flex-1">
          <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <li>
              <RoomBackButton fallback={venuePath({ id: eventId, slug: eventSlug, event_type: eventType })} />
            </li>
            <li>
              <BackLink
                to={venuePath({ id: eventId, slug: eventSlug, event_type: eventType })}
                className="inline-flex items-center gap-1.5 font-bold text-ktip-ocean-600 hover:underline"
              >
                <MapIcon size={15} aria-hidden="true" />
                <Trans>Venue map</Trans>
              </BackLink>
            </li>
            <li aria-hidden="true" className="text-ktip-sand-400">/</li>
            <li className="min-w-0">
              <TitleTag className="truncate font-bold text-ktip-sand-900">{eventTitle}</TitleTag>
            </li>
            <li aria-hidden="true" className="hidden text-ktip-sand-400 sm:block">/</li>
            <li className="hidden min-w-0 items-center gap-1 font-semibold text-ktip-sand-500 sm:flex" aria-current="page">
              {crumbs.floor && (
                <>
                  <span className="truncate">{crumbs.floor}</span>
                  <ChevronRight size={13} className="shrink-0" aria-hidden="true" />
                </>
              )}
              <span className="truncate">{crumbs.room}</span>
            </li>
          </ol>
        </nav>
      ) : (
        <>
          <BackLink
            to={
              backToMap
                ? venuePath({ id: eventId, slug: eventSlug, event_type: eventType })
                : `/events/${eventSlug || eventId}`
            }
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ktip-ocean-600 hover:underline"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {backToMap ? t`Back to the map` : t`Event page`}
          </BackLink>

          <span className="hidden h-4 w-px bg-ktip-sand-200 sm:block" aria-hidden="true" />

          <TitleTag className="min-w-0 flex-1 truncate font-display text-sm font-bold text-ktip-sand-900">
            {eventTitle}
          </TitleTag>
        </>
      )}

      {/* One chip carries both facts: the count, and whether it can be
          trusted. Live is the default state, so it earns only a dot — the
          chip changes voice only when the socket drops for real, which is the
          news. During the grace window it renders nothing at all. */}
      {submissionDeadline && <SubmissionCountdown deadline={submissionDeadline} />}

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
          {connected ? <Trans>{headcount} in the venue</Trans> : t`Reconnecting`}
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
