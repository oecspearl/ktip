import { Link } from 'react-router'
import { differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import { ArrowRight, CalendarX } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CALENDAR_BADGE_CLASS } from '../../lib/constants'
import { CalendarAccentBar } from './CalendarAccentBar'
import type { CalendarItem } from '../../lib/calendar'

interface CalendarDayPanelProps {
  date: Date
  items: CalendarItem[]
  loading?: boolean
  itemNoun?: string
  emptyLabel?: string
  onJumpToNext?: () => void
  /** Walkthrough anchor — the events page targets its own panel */
  dataTutorial?: string
}

function CalendarItemRow({ item, day }: { item: CalendarItem; day: Date }) {
  const Icon = item.icon
  const start = new Date(item.start)
  const end = item.end ? new Date(item.end) : start
  const isMultiDay = !isSameDay(start, end)

  let timeLabel: string
  if (isMultiDay) {
    const dayIndex = differenceInCalendarDays(startOfDay(day), startOfDay(start)) + 1
    const totalDays = differenceInCalendarDays(startOfDay(end), startOfDay(start)) + 1
    timeLabel = `Day ${Math.min(Math.max(dayIndex, 1), totalDays)} of ${totalDays}`
  } else {
    timeLabel = format(start, 'h:mm a')
  }

  const body = (
    <>
      <CalendarAccentBar item={item} className="w-1 rounded-full self-stretch shrink-0" />
      <span className="w-16 shrink-0 pt-0.5 text-xs font-bold text-ktip-sand-700">{timeLabel}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm text-ktip-ink line-clamp-2 group-hover:text-ktip-ocean-700 transition-colors">
            {item.title}
          </span>
          {item.href && (
            <ArrowRight
              size={14}
              className="shrink-0 mt-0.5 text-ktip-sand-400 transition-all group-hover:text-ktip-ocean-600 group-hover:translate-x-0.5"
            />
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {item.badgeLabel && (
            <span className={cn(CALENDAR_BADGE_CLASS, item.chipClass)}>{item.badgeLabel}</span>
          )}
          {/* The viewer's own status, on the same row as the type badge — the
              registration used to be a whole second card for the same event */}
          {item.relation && (
            <span
              className={cn(
                CALENDAR_BADGE_CLASS,
                'flex items-center gap-1',
                item.relation.chipClass
              )}
            >
              <span aria-hidden="true">{item.relation.negative ? '✕' : '✓'}</span>
              {item.relation.label}
              {item.relation.detail && (
                <span className="opacity-70">· {item.relation.detail}</span>
              )}
            </span>
          )}
          {item.subtitle && (
            <span className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
              {Icon && <Icon size={12} className="shrink-0" />}
              <span className="truncate">{item.subtitle}</span>
            </span>
          )}
          {item.badges}
        </span>
      </span>
    </>
  )

  const shell =
    'group flex gap-3 rounded-cal border border-ktip-line bg-ktip-canvas/70 p-3 transition-all duration-200'

  if (!item.href) {
    return <div className={cn(shell, item.dimmed && 'opacity-60')}>{body}</div>
  }

  return (
    <Link
      to={item.href}
      className={cn(
        shell,
        'hover:shadow-card-hover hover:-translate-y-0.5 hover:border-ktip-ocean-200',
        item.dimmed && 'opacity-60'
      )}
    >
      {body}
    </Link>
  )
}

/**
 * Generic day detail panel — lists whatever `CalendarItem`s fall on `date`.
 */
export function CalendarDayPanel({
  date,
  items,
  loading,
  itemNoun = 'item',
  emptyLabel,
  onJumpToNext,
  dataTutorial,
}: CalendarDayPanelProps) {
  return (
    <div
      data-tutorial={dataTutorial}
      className="bg-ktip-cream rounded-cal border border-ktip-line shadow-card p-4 sm:p-5 lg:sticky lg:top-24 lg:max-h-[calc(100svh-8rem)] lg:overflow-y-auto"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-ktip-ocean-600">
        {format(date, 'EEEE')}
      </p>
      <h2 className="font-display font-bold text-xl text-ktip-sand-900 animate-none">
        {format(date, 'MMMM d, yyyy')}
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {loading ? 'Loading…' : `${items.length} ${itemNoun}${items.length !== 1 ? 's' : ''}`}
      </p>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="animate-pulse bg-ktip-sand-100 rounded-cal h-20" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div
          key={format(date, 'yyyy-MM-dd')}
          className="animate-tab-enter stagger-children flex flex-col gap-3"
        >
          {items.map((item) => (
            <CalendarItemRow key={item.id} item={item} day={date} />
          ))}
        </div>
      ) : (
        <div key={format(date, 'yyyy-MM-dd')} className="animate-tab-enter text-center py-10">
          <div className="w-12 h-12 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <CalendarX size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-semibold text-ktip-sand-800 mb-1">
            {emptyLabel ?? `Nothing on this day`}
          </p>
          <p className="text-xs text-gray-500 mb-3">Pick another date on the calendar.</p>
          {onJumpToNext && (
            <button
              type="button"
              onClick={onJumpToNext}
              className="text-sm font-semibold text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
            >
              Jump to next {itemNoun} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
