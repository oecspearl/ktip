import { Link } from 'react-router'
import { format, isSameDay } from 'date-fns'
import { cn } from '../../lib/utils'
import { CALENDAR_FALLBACK_GRADIENT } from '../../lib/constants'
import type { CalendarItem } from '../../lib/calendar'
import { DiamondAvatar } from '../ui/DiamondAvatar'

interface CalendarEventCardProps {
  item: CalendarItem
  /** Positioned height as a share of the grid — drives how much detail fits */
  heightPct?: number
  /** All-day rail cards are a single squat line */
  variant?: 'timed' | 'all-day'
  style?: React.CSSProperties
  className?: string
}

/** `6 – 7 PM`, or just `6 PM` when there is no distinct end. */
function timeRangeLabel(item: CalendarItem): string {
  const start = new Date(item.start)
  const end = item.end ? new Date(item.end) : null
  const startLabel = format(start, start.getMinutes() ? 'h:mm' : 'h')
  if (!end || end.getTime() <= start.getTime() || !isSameDay(start, end)) {
    return format(start, start.getMinutes() ? 'h:mm a' : 'h a')
  }
  return `${startLabel} – ${format(end, end.getMinutes() ? 'h:mm a' : 'h a')}`
}

function Avatar({ url, name }: { url?: string | null; name?: string | null }) {
  return (
    <DiamondAvatar
      src={url}
      name={name || 'Organizer'}
      size={20}
      frameClassName="ring-1 ring-white/70"
    />
  )
}

/**
 * A single event on the week grid. Detail degrades with the card's height so a
 * 30-minute slot shows a title rather than clipping four stacked lines.
 */
export function CalendarEventCard({
  item,
  heightPct = 100,
  variant = 'timed',
  style,
  className,
}: CalendarEventCardProps) {
  const allDay = variant === 'all-day'
  const timeLabel = allDay ? 'All day' : timeRangeLabel(item)
  // Roughly: under ~7% of a 12-hour window is well under an hour of screen
  const showMeta = allDay || heightPct >= 7
  const showFooter = !allDay && heightPct >= 11

  const ariaLabel = [
    item.badgeLabel,
    item.title,
    allDay ? 'all day' : timeLabel,
    item.statusLabel,
  ]
    .filter(Boolean)
    .join(', ')

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-cal-sm', item.dotClass)}
      />
      <span className="relative flex h-full min-w-0 flex-col gap-0.5 overflow-hidden pl-2">
        {showMeta && item.badgeLabel && (
          <span className="truncate text-[9px] font-bold uppercase tracking-wider opacity-70">
            {item.badgeLabel}
          </span>
        )}
        <span className="truncate text-[11px] font-bold leading-tight">{item.title}</span>
        {showMeta && (
          <span className="truncate text-[10px] font-semibold opacity-70">{timeLabel}</span>
        )}
        {showFooter && (item.avatarUrl || item.avatarName || item.statusLabel) && (
          <span className="mt-auto flex items-center gap-1.5 pt-1">
            {(item.avatarUrl || item.avatarName) && (
              <Avatar url={item.avatarUrl} name={item.avatarName} />
            )}
            {item.statusLabel && (
              <span className="truncate rounded-full bg-white/60 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-ktip-sand-700 dark:text-ktip-sand-100">
                {item.statusLabel}
              </span>
            )}
          </span>
        )}
      </span>
    </>
  )

  const shell = cn(
    'group relative flex overflow-hidden rounded-cal-sm border p-1.5 text-left shadow-soft transition-all duration-200',
    item.gradientClass ?? CALENDAR_FALLBACK_GRADIENT,
    allDay ? 'items-center' : 'items-stretch',
    item.dimmed && 'opacity-60 saturate-50',
    className
  )

  if (!item.href) {
    return (
      <div className={shell} style={style} aria-label={ariaLabel}>
        {body}
      </div>
    )
  }

  return (
    <Link
      to={item.href}
      style={style}
      aria-label={ariaLabel}
      className={cn(shell, 'hover:shadow-card-hover hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none')}
    >
      {body}
    </Link>
  )
}
