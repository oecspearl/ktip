import { Link } from 'react-router'
import { differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import { ArrowLeft, ArrowRight, CalendarX, Plus, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  CALENDAR_BADGE_CLASS,
  CALENDAR_CHROME_CLASS,
  CALENDAR_META_CLASS,
} from '../../lib/constants'
import { CalendarAccentBar } from './CalendarAccentBar'
import { formatDuration, formatMinuteRange, isPastItem, itemSpan } from '../../lib/calendar-week'
import { useTimeFormat } from './useTimeFormat'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import type { CalendarItem } from '../../lib/calendar'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

interface CalendarDayPanelProps {
  date: Date
  items: CalendarItem[]
  loading?: boolean
  itemNoun?: string
  emptyLabel?: string
  onJumpToNext?: () => void
  /** The item to show in detail; the agenda list is shown when null */
  selectedItem?: CalendarItem | null
  onSelectItem: (item: CalendarItem | null) => void
  /** Renders the compose face instead of the agenda — see `onAddNote` */
  composer?: React.ReactNode
  /** Shows the footer button that swaps the panel to `composer` */
  onAddNote?: () => void
}

const PANEL_SHELL = 'flex h-full min-h-full flex-col'
// flex-1 rather than a fixed height: the footer button belongs at the bottom of
// the pane, so the list has to take whatever is left rather than set the height
const PANEL_BODY = 'min-h-0 flex-1 overflow-y-auto p-4'

/** `9 – 10:30 AM`, or `Day 2 of 3` for a span that covers the whole day. */
function timeLabel(item: CalendarItem, day: Date, use24: boolean): string {
  const start = new Date(item.start)
  const end = item.end ? new Date(item.end) : start
  if (!isSameDay(start, end)) {
    const dayIndex = differenceInCalendarDays(startOfDay(day), startOfDay(start)) + 1
    const totalDays = differenceInCalendarDays(startOfDay(end), startOfDay(start)) + 1
    const dayNumber = Math.min(Math.max(dayIndex, 1), totalDays)
    return `${dayNumber}/${totalDays}`
  }
  const span = itemSpan(item)
  return span ? formatMinuteRange(span.startMin, span.endMin, use24) : ''
}

function CalendarItemRow({
  item,
  day,
  selected,
  onSelect,
}: {
  item: CalendarItem
  day: Date
  selected: boolean
  onSelect: (item: CalendarItem) => void
}) {
  const { use24 } = useTimeFormat()
  const Icon = item.icon
  const past = isPastItem(item)

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      className={cn(
        'group flex w-full gap-3 rounded-surface p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
        selected
          ? 'bg-ktip-ocean-50 ring-1 ring-ktip-ocean-300'
          : 'bg-ktip-sand-50 shadow-neu-sm-inset hover:bg-ktip-sand-100',
        item.dimmed && 'opacity-60'
      )}
    >
      <CalendarAccentBar item={item} className="w-1 shrink-0 self-stretch rounded-full" />
      <span
        className={cn(
          CALENDAR_META_CLASS,
          'w-14 shrink-0 pt-0.5 font-bold',
          past ? 'text-ktip-sand-400' : 'text-ktip-sand-700'
        )}
      >
        {timeLabel(item, day, use24)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span
            className={cn(
              'line-clamp-2 text-caption font-semibold transition-colors group-hover:text-ktip-ocean-700',
              // Not text-ktip-ink — that token stays navy in dark mode, which
              // is what made these titles unreadable at night
              past ? 'text-ktip-sand-600' : 'text-ktip-sand-900'
            )}
          >
            {item.title}
          </span>
          <ArrowRight
            size={14}
            className="mt-0.5 shrink-0 text-ktip-sand-400 transition-all group-hover:translate-x-0.5 group-hover:text-ktip-ocean-600"
          />
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {item.badgeLabel && (
            <span className={cn(CALENDAR_BADGE_CLASS, item.chipClass)}>{item.badgeLabel}</span>
          )}
          {/* The viewer's own status, on the same row as the type badge — the
              registration used to be a whole second card for the same event */}
          {item.relation && (
            <span
              className={cn(CALENDAR_BADGE_CLASS, 'flex items-center gap-1', item.relation.chipClass)}
            >
              <span aria-hidden="true">{item.relation.negative ? '✕' : '✓'}</span>
              {item.relation.label}
            </span>
          )}
          {item.subtitle && (
            <span className="flex min-w-0 items-center gap-1 text-caption text-ktip-sand-600">
              {Icon && <Icon size={12} className="shrink-0" />}
              <span className="truncate">{item.subtitle}</span>
            </span>
          )}
          {item.badges}
        </span>
      </span>
    </button>
  )
}

function ItemDetail({
  item,
  day,
  onBack,
}: {
  item: CalendarItem
  day: Date
  onBack: () => void
}) {
  const { t } = useLingui()
  const { use24 } = useTimeFormat()
  const Icon = item.icon
  const span = itemSpan(item)
  const multiDay = item.end ? !isSameDay(new Date(item.start), new Date(item.end)) : false

  const field = (label: string, value: React.ReactNode) => (
    <div>
      <p className={cn(CALENDAR_CHROME_CLASS, 'mb-1 text-ktip-sand-500')}>{label}</p>
      <div className="text-caption text-ktip-sand-800">{value}</div>
    </div>
  )

  return (
    <div className={PANEL_SHELL}>
      <div className="flex items-start justify-between gap-2 border-b border-ktip-sand-200 p-4">
        <div className="min-w-0">
          <p className={cn(CALENDAR_CHROME_CLASS, 'text-ktip-sand-500')}>
            {item.badgeLabel ?? <Trans>Details</Trans>}
          </p>
          <h3 className="mt-1 animate-none font-display text-title-sm font-bold tracking-tight text-ktip-sand-900">
            {item.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label={t`Close details`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ktip-sand-600 shadow-neu-sm transition-all hover:text-ktip-ocean-700 active:shadow-neu-sm-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
        >
          <X size={13} />
        </button>
      </div>

      <div className={cn(PANEL_BODY, 'flex flex-col gap-4')}>
        {field(
          t`When`,
          <span className="flex flex-wrap items-baseline gap-2">
            <span className={cn(CALENDAR_META_CLASS, 'font-bold text-ktip-sand-900')}>
              {multiDay
                ? `${format(new Date(item.start), 'MMM d')} – ${format(new Date(item.end!), 'MMM d')}`
                : span
                  ? formatMinuteRange(span.startMin, span.endMin, use24)
                  : format(new Date(item.start), 'MMM d')}
            </span>
            {!multiDay && span && (
              <span className={cn(CALENDAR_META_CLASS, 'text-ktip-sand-500')}>
                {formatDuration(span.startMin, span.endMin)}
              </span>
            )}
            <span className="text-caption text-ktip-sand-600">{format(day, 'EEEE, MMMM d')}</span>
          </span>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5">
            <CalendarAccentBar item={item} className="h-3 w-[3px] rounded-full" />
            {item.badgeLabel && (
              <span className={cn(CALENDAR_BADGE_CLASS, item.chipClass)}>{item.badgeLabel}</span>
            )}
          </span>
          {item.relation && (
            <span
              className={cn(CALENDAR_BADGE_CLASS, 'flex items-center gap-1', item.relation.chipClass)}
            >
              <span aria-hidden="true">{item.relation.negative ? '✕' : '✓'}</span>
              {item.relation.label}
              {item.relation.detail && <span className="opacity-70">· {item.relation.detail}</span>}
            </span>
          )}
          {item.statusLabel && (
            <span className={cn(CALENDAR_BADGE_CLASS, 'border-ktip-sand-200 text-ktip-sand-600')}>
              {item.statusLabel}
            </span>
          )}
          {item.badges}
        </div>

        {(item.locationLabel || item.subtitle) &&
          field(
            t`Where`,
            <span className="flex items-center gap-1.5">
              {Icon && <Icon size={13} className="shrink-0 text-ktip-sand-500" />}
              <span className="min-w-0 break-words">{item.locationLabel ?? item.subtitle}</span>
            </span>
          )}

        {(item.avatarUrl || item.avatarName) &&
          field(
            t`Who`,
            <span className="flex items-center gap-2">
              <DiamondAvatar src={item.avatarUrl} name={item.avatarName || t`Organizer`} size={22} />
              <span className="truncate">{item.avatarName}</span>
            </span>
          )}

        {item.description &&
          field(
            t`Notes`,
            <p className="whitespace-pre-line break-words leading-relaxed">{item.description}</p>
          )}
      </div>

      <div className="flex items-center gap-2 border-t border-ktip-sand-200 p-4">
        {item.href ? (
          <Link
            to={item.href}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-neu-sm bg-brand-navy px-3 py-2 text-micro font-bold uppercase tracking-wider text-white shadow-neu transition-all hover:bg-brand-green hover:text-brand-navy active:translate-y-px active:shadow-neu-inset dark:bg-brand-green dark:text-brand-navy"
          >
            <Trans>Open</Trans>
            <ArrowRight size={14} />
          </Link>
        ) : (
          <p className="flex-1 text-caption text-ktip-sand-500">
            <Trans>Nothing to open — this item lives outside the platform.</Trans>
          </p>
        )}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-neu-sm px-3 py-2 text-micro font-bold uppercase tracking-wider text-ktip-sand-600 transition-all hover:text-ktip-ocean-700 hover:shadow-neu-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
        >
          <ArrowLeft size={14} />
          <Trans>Day</Trans>
        </button>
      </div>
    </div>
  )
}

/**
 * The right pane. Two states in one column: the day's agenda, and the detail of
 * whichever item was picked — from the list or from the grid.
 *
 * Read-only by design. Editing an event means its type-specific form, its
 * permissions and its validation; duplicating a slice of that here would give
 * two places to change the same record and one of them would be wrong.
 */
export function CalendarDayPanel({
  date,
  items,
  loading,
  itemNoun = 'item',
  emptyLabel,
  onJumpToNext,
  selectedItem,
  onSelectItem,
  composer,
  onAddNote,
}: CalendarDayPanelProps) {
  const { t } = useLingui()

  // The panel has three faces and shows one at a time. Keyed so React remounts
  // on the swap, which is what re-fires the shuffle — the same animation the
  // dashboard uses when its content pane changes.
  const face = composer ? 'compose' : selectedItem ? `item:${selectedItem.id}` : 'agenda'

  if (composer) {
    return (
      <div key={face} className="pane-shuffle h-full">
        {composer}
      </div>
    )
  }

  if (selectedItem) {
    return (
      <div key={face} className="pane-shuffle h-full">
        <ItemDetail item={selectedItem} day={date} onBack={() => onSelectItem(null)} />
      </div>
    )
  }

  // itemNoun only ever arrives as "item" or "event" today — a third caller
  // would need its own branch here, the same way the other two do.
  const countLabel =
    itemNoun === 'event'
      ? plural(items.length, { one: '# event', other: '# events' })
      : plural(items.length, { one: '# item', other: '# items' })
  const nextLabel = itemNoun === 'event' ? t`Jump to next event` : t`Jump to next item`

  return (
    <div key={face} className={cn(PANEL_SHELL, 'pane-shuffle')}>
      <div className="border-b border-ktip-sand-200 p-4">
        <p className={cn(CALENDAR_CHROME_CLASS, 'text-ktip-ocean-600')}>{format(date, 'EEEE')}</p>
        <h3 className="animate-none font-display text-title-sm font-bold tracking-tight text-ktip-sand-900">
          {format(date, 'MMMM d, yyyy')}
        </h3>
        <p className={cn(CALENDAR_META_CLASS, 'mt-0.5 text-ktip-sand-500')}>
          {loading ? t`Loading…` : countLabel}
        </p>
      </div>

      <div className={PANEL_BODY}>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-surface bg-ktip-sand-100" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div
            key={format(date, 'yyyy-MM-dd')}
            className="stagger-children flex animate-tab-enter flex-col gap-2"
          >
            {items.map((item) => (
              <CalendarItemRow
                key={item.id}
                item={item}
                day={date}
                selected={false}
                onSelect={onSelectItem}
              />
            ))}
          </div>
        ) : (
          <div key={format(date, 'yyyy-MM-dd')} className="animate-tab-enter py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ktip-sand-100">
              <CalendarX size={22} className="text-ktip-sand-500" />
            </div>
            <p className="mb-1 text-caption font-semibold text-ktip-sand-800">
              {emptyLabel ?? t`Nothing on this day`}
            </p>
            <p className="mb-3 text-caption text-ktip-sand-500">
              <Trans>Pick another date on the calendar.</Trans>
            </p>
            {onJumpToNext && (
              <button
                type="button"
                onClick={onJumpToNext}
                className="text-caption font-semibold text-ktip-ocean-600 transition-colors hover:text-ktip-ocean-700 hover:underline"
              >
                {nextLabel} →
              </button>
            )}
          </div>
        )}
      </div>

      {onAddNote && (
        <div className="border-t border-ktip-sand-200 p-4">
          <button
            type="button"
            onClick={onAddNote}
            className="flex w-full items-center justify-center gap-1.5 rounded-neu-sm px-3 py-2 text-micro font-bold uppercase tracking-wider text-ktip-ocean-700 shadow-neu-sm transition-all hover:text-ktip-ocean-700 active:translate-y-px active:shadow-neu-sm-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
          >
            <Plus size={14} />
            <Trans>Note, task or reminder</Trans>
          </button>
        </div>
      )}
    </div>
  )
}
