import { format, isSameMonth, isSameYear } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { CalendarView } from './useCalendarRange'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

interface CalendarShellProps {
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  /** Anchor month — titles the month view */
  monthDate: Date
  /** Visible window — titles the week view */
  gridStart: Date
  gridEnd: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  /** Extra controls rendered left of the view switch */
  headerExtra?: React.ReactNode
  children: React.ReactNode
  className?: string
}

const VIEWS: { value: CalendarView; label: MessageDescriptor }[] = [
  { value: 'month', label: msg`Month` },
  { value: 'week', label: msg`Week` },
]

/** `Jul 13 – 19, 2026`, or `Jun 29 – Jul 5, 2026` across a month boundary. */
function weekRangeLabel(start: Date, end: Date): string {
  if (!isSameYear(start, end)) {
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
  }
  if (isSameMonth(start, end)) {
    return `${format(start, 'MMM d')} – ${format(end, 'd, yyyy')}`
  }
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

/**
 * Card surface + header shared by the month grid and the week view, so
 * switching views never changes the chrome around them.
 */
export function CalendarShell({
  view,
  onViewChange,
  monthDate,
  gridStart,
  gridEnd,
  onPrev,
  onNext,
  onToday,
  headerExtra,
  children,
  className,
}: CalendarShellProps) {
    const { t , i18n } = useLingui()
  const title = view === 'week' ? weekRangeLabel(gridStart, gridEnd) : format(monthDate, 'MMMM yyyy')

  return (
    <div
      className={cn(
        'bg-ktip-cream rounded-cal border border-ktip-line shadow-card p-4 sm:p-5',
        className
      )}
    >
      <div
        data-tutorial="calendar-header"
        className="flex flex-wrap items-center justify-between gap-3 mb-4"
      >
        <h2 className="font-display font-bold text-xl text-ktip-sand-900 animate-none">{title}</h2>

        <div className="flex items-center gap-2">
          {headerExtra}

          {/* Month / Week switch */}
          <div
            role="group"
            aria-label={t`Calendar view`}
            className="flex items-center gap-0.5 rounded-full border border-ktip-line bg-ktip-canvas/70 p-0.5"
          >
            {VIEWS.map((option) => {
              const active = view === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onViewChange(option.value)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none',
                    active
                      ? 'bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white shadow-soft'
                      : 'text-ktip-sand-600 hover:text-ktip-ocean-700 hover:bg-ktip-ocean-50'
                  )}
                >
                  {i18n._(option.label)}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={onToday}
            className="text-xs font-bold uppercase tracking-wider text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-full px-3 py-1.5 transition-colors"
          >
            <Trans>Today</Trans>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              aria-label={view === 'week' ? t`Previous week` : t`Previous month`}
              className="h-9 w-9 flex items-center justify-center rounded-full border border-ktip-line text-ktip-sand-700 transition-all hover:bg-ktip-sand-100 hover:text-ktip-ocean-700 active:scale-95 focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label={view === 'week' ? t`Next week` : t`Next month`}
              className="h-9 w-9 flex items-center justify-center rounded-full border border-ktip-line text-ktip-sand-700 transition-all hover:bg-ktip-sand-100 hover:text-ktip-ocean-700 active:scale-95 focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 focus-visible:outline-none"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
