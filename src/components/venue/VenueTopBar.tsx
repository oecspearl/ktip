import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Check, ChevronDown, ChevronRight, Map as MapIcon, WifiOff } from 'lucide-react'
import { cn } from '../../lib/utils'
import { venuePath, venueRoomPath } from '../../lib/event-slug'
import { IrisLink, useIrisTransition } from '../ui/IrisTransition'
import { AvailabilityPicker } from './AvailabilityPicker'
import { AvatarCluster } from './AvatarCluster'
import { clockLeft, useNowUntil } from './room/judging/judging-time'
import type { VenueAvailability, VenueOccupant } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface VenueTopBarProps {
  eventId: string
  /** events.slug — null on a row that predates migration 087's backfill. */
  eventSlug: string | null
  /** events.event_type — picks the canonical venue segment for the map link. */
  eventType?: string | null
  eventTitle: string
  headcount: number
  /** A few of the people here, shown as faces beside the count. */
  faces?: VenueOccupant[]
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
  crumbs?: {
    floor: string | null
    room: string
    /** With the venue's rooms, the last crumb opens a list to change room from. */
    roomKey?: string
    rooms?: CrumbRoom[]
    /** Floor names by level, for the list's headings. */
    floors?: string[]
  }
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
interface CrumbRoom {
  key: string
  name: string
  floor: number
  sort: number
  open: boolean
}

/**
 * The last crumb, as a way to change room: "Ground › Networking Lounge" opens
 * the venue's rooms by floor, and picking one goes there through the iris.
 */
function RoomSwitcher({
  floor,
  room,
  roomKey,
  rooms,
  floors,
  pathFor,
}: {
  floor: string | null
  room: string
  roomKey: string
  rooms: CrumbRoom[]
  floors: string[]
  pathFor: (key: string) => string
}) {
  const { t } = useLingui()
  const iris = useIrisTransition()
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const shell = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!shell.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    // Start on the room you are in, so the arrow keys move from there.
    shell.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const levels = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)
  const go = (key: string) => {
    setOpen(false)
    if (key !== roomKey) void iris.navigate(pathFor(key))
  }
  // Up and down walk the list; Home and End jump to its ends.
  const onMenuKey = (e: ReactKeyboardEvent) => {
    const items = [...(shell.current?.querySelectorAll<HTMLElement>('[data-room-item]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'ArrowDown' ? items[(at + 1) % items.length]
      : e.key === 'ArrowUp' ? items[(at - 1 + items.length) % items.length]
      : e.key === 'Home' ? items[0]
      : e.key === 'End' ? items[items.length - 1]
      : null
    if (!next) return
    e.preventDefault()
    next.focus()
  }

  return (
    <div ref={shell} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t`Change room. You are in ${room}`}
        onClick={() => setOpen((on) => !on)}
        className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-control px-2 font-semibold text-ktip-sand-600 transition-colors hover:bg-ktip-sand-100 hover:text-ktip-sand-900 aria-expanded:bg-ktip-sand-100 aria-expanded:text-ktip-sand-900"
      >
        {floor && (
          <>
            <span className="hidden truncate sm:inline">{floor}</span>
            <ChevronRight size={13} className="hidden shrink-0 sm:inline" aria-hidden="true" />
          </>
        )}
        <span className="truncate text-ktip-sand-900">{room}</span>
        <ChevronDown size={14} className={cn('shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="group"
          aria-label={t`Rooms`}
          onKeyDown={onMenuKey}
          className="absolute left-0 top-full z-dropdown mt-1.5 max-h-[min(70svh,32rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-surface border border-ktip-sand-200 bg-ktip-cream py-1.5 shadow-card"
        >
          {levels.map((level) => (
            <div key={level}>
              {levels.length > 1 && (
                <p className="px-3 pb-1 pt-2.5 text-micro font-extrabold uppercase tracking-[0.08em] text-ktip-sand-500">
                  {floors[level] || t`Level ${level}`}
                </p>
              )}
              <ul>
                {rooms
                  .filter((r) => r.floor === level)
                  .sort((a, b) => a.sort - b.sort)
                  .map((r) => {
                    const here = r.key === roomKey
                    return (
                      <li key={r.key}>
                        <button
                          type="button"
                          data-room-item
                          aria-current={here ? 'page' : undefined}
                          onClick={() => go(r.key)}
                          className={cn(
                            'flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-ktip-sand-100 focus-visible:bg-ktip-sand-100',
                            here ? 'font-extrabold text-ktip-ocean-700' : 'font-medium text-ktip-sand-800'
                          )}
                        >
                          <span className="min-w-0 flex-1 break-words">{r.name}</span>
                          {!r.open && (
                            <span className="shrink-0 text-xs font-medium text-ktip-sand-500">
                              <Trans>Closed</Trans>
                            </span>
                          )}
                          {here && <Check size={15} className="shrink-0" aria-hidden="true" />}
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
      className="flex h-7 items-center gap-2 rounded-full bg-brand-navy px-3 text-xs font-semibold text-white/75"
    >
      {left > 0 ? (
        // role="timer" is polite by default: read on focus, not every second.
        <span role="timer">
          <span className="sr-only sm:not-sr-only">
            <Trans>Submissions close in</Trans>{' '}
          </span>
          <time
            dateTime={new Date(end).toISOString()}
            className="text-sm font-extrabold tabular-nums tracking-[0.02em] text-ktip-sun-400"
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
  faces,
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
            {crumbs.roomKey && crumbs.rooms && crumbs.rooms.length > 1 ? (
              <>
                <li aria-hidden="true" className="text-ktip-sand-400">/</li>
                <li className="min-w-0">
                  <RoomSwitcher
                    floor={crumbs.floor}
                    room={crumbs.room}
                    roomKey={crumbs.roomKey}
                    rooms={crumbs.rooms}
                    floors={crumbs.floors ?? []}
                    pathFor={(key) => venueRoomPath({ id: eventId, slug: eventSlug, event_type: eventType }, key)}
                  />
                </li>
              </>
            ) : (
              <>
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
              </>
            )}
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
            faces && faces.length > 0 ? (
              <AvatarCluster occupants={faces} size="sm" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-ktip-tropical-500" aria-hidden="true" />
            )
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
