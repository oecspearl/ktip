import { useEffect, useMemo, useRef, useState } from 'react'
import { format, isSameMonth, isSameYear } from 'date-fns'
import { ChevronLeft, ChevronRight, PanelRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Segmented } from '../ui/Segmented'
import { CALENDAR_CHROME_CLASS } from '../../lib/constants'
import { CalendarYearPicker } from './CalendarYearPicker'
import { CalendarTimeFormatProvider, useTimeFormat } from './useTimeFormat'
import { useCalendarShortcuts } from './useCalendarShortcuts'
import type { CalendarView } from './useCalendarRange'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

interface CalendarShellProps {
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  /** Anchor month — titles the month view */
  monthDate: Date
  /** The date the window hangs off — titles the year view */
  anchorDate: Date
  /** Visible window — titles the week and day views */
  gridStart: Date
  gridEnd: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  /** Jump to another year from the header — the arrows only step one unit */
  onSelectYear: (year: number) => void
  /** Total items in the visible window — printed on the range line */
  itemCount?: number
  itemNoun?: string
  /** Filters and lenses, in a row under the header */
  toolbar?: React.ReactNode
  /** The right pane — day agenda or item detail */
  panel?: React.ReactNode
  /** Walkthrough anchor for the panel column */
  panelTutorial?: string
  /** Wired to the N shortcut; omitted where there is nothing to create */
  onNew?: () => void
  /**
   * Changes whenever the user picks a day or an item. The panel is collapsed by
   * default, so something has to say "they are looking at this now" — a bare
   * `selectedDate` watch would miss picking a second item on the same day.
   */
  focusKey?: string
  /** Closes the detail pane — bound to Escape */
  onDismiss?: () => void
  children: React.ReactNode
  className?: string
}

const VIEWS: { value: CalendarView; label: MessageDescriptor }[] = [
  { value: 'year', label: msg`Year` },
  { value: 'month', label: msg`Month` },
  { value: 'week', label: msg`Week` },
  { value: 'day', label: msg`Day` },
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

const STEP_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-full text-ktip-sand-700 shadow-neu-sm transition-all hover:text-ktip-ocean-700 active:translate-y-px active:shadow-neu-sm-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500'

/** Open panes read as pressed-in, the same idiom as the dashboard tab rail. */
const PANE_TOGGLE =
  'h-8 w-8 shrink-0 items-center justify-center rounded-neu-sm text-ktip-sand-600 transition-all hover:text-ktip-ocean-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500 shadow-neu-sm aria-pressed:shadow-neu-sm-inset aria-pressed:text-ktip-ocean-700'

function CalendarShellInner({
  view,
  onViewChange,
  monthDate,
  anchorDate,
  gridStart,
  gridEnd,
  onPrev,
  onNext,
  onToday,
  onSelectYear,
  itemCount,
  itemNoun = 'item',
  toolbar,
  panel,
  panelTutorial,
  onNew,
  focusKey,
  onDismiss,
  children,
  className,
}: CalendarShellProps) {
  const { t, i18n } = useLingui()
  const { use24, setUse24 } = useTimeFormat()

  // The panel starts closed: the grid is the thing, and a rail of chrome beside
  // it on first paint is the shape this redesign was meant to get away from
  const [panelOpen, setPanelOpen] = useState(false)

  // Picking a day or an item is the request to see it, so the panel opens
  // itself rather than making that two clicks.
  //
  // Keyed on the value rather than on "have I run before". A once-only ref is
  // consumed by StrictMode's second mount pass, which then reads as a real
  // selection and springs the panel open on first paint — the exact thing the
  // closed default above is for. Comparing the key is idempotent however many
  // times the effect is invoked.
  const lastFocus = useRef(focusKey)
  useEffect(() => {
    if (lastFocus.current === focusKey) return
    lastFocus.current = focusKey
    setPanelOpen(true)
  }, [focusKey])

  useCalendarShortcuts({
    onPrev,
    onNext,
    onToday,
    onEscape: () => {
      setPanelOpen(false)
      onDismiss?.()
    },
    onNew,
  })

  const titleDate = view === 'month' ? monthDate : gridStart
  // The year view spans months, so naming one of them in the heading would be
  // a lie — the year is the title there
  const title = view === 'year' ? format(anchorDate, 'yyyy') : format(titleDate, 'MMMM')
  const titleYear = (view === 'year' ? anchorDate : titleDate).getFullYear()

  // The heading already names the month, so the range line only earns its place
  // in the views where it says something the heading does not
  const span =
    view === 'month' || view === 'year'
      ? undefined
      : view === 'day'
        ? format(gridStart, 'EEEE, MMM d')
        : weekRangeLabel(gridStart, gridEnd)

  // Whatever the browser thinks it is, rather than a hard-coded AST — the
  // platform is regional and a wrong timezone label is worse than none
  const timezone = useMemo(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      return zone ? zone.split('/').pop()?.replace(/_/g, ' ') : undefined
    } catch {
      return undefined
    }
  }, [])

  const countLabel =
    itemCount === undefined
      ? undefined
      : itemNoun === 'event'
        ? t`${itemCount} events`
        : t`${itemCount} items`

  const rangeLine = [span, countLabel, timezone].filter(Boolean).join('  ·  ')

  // Animating the grid track rather than the pane itself: the grid owns the
  // width, so transitioning anything else would leave the main column snapping
  // to its new size a frame ahead of the pane sliding out
  const columns = `minmax(0,1fr) ${panelOpen ? '20rem' : '0rem'}`

  return (
    <div
      style={{ '--cal-columns': columns } as React.CSSProperties}
      className={cn(
        'neu-surface overflow-hidden rounded-surface border border-ktip-sand-200 bg-ktip-cream shadow-card',
        'grid grid-cols-1 xl:[grid-template-columns:var(--cal-columns)]',
        'transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none',
        className
      )}
    >
      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <div
          data-tutorial="calendar-header"
          className="flex flex-wrap items-end justify-between gap-3 p-4"
        >
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              {view === 'year' ? (
                <CalendarYearPicker
                  year={titleYear}
                  onChange={onSelectYear}
                  triggerClassName="animate-none font-display text-title font-bold tracking-tight text-ktip-sand-900 -ml-1.5"
                />
              ) : (
                <>
                  <h2 className="animate-none font-display text-title font-bold tracking-tight text-ktip-sand-900">
                    {title}
                  </h2>
                  <CalendarYearPicker
                    year={titleYear}
                    onChange={onSelectYear}
                    triggerClassName={cn(CALENDAR_CHROME_CLASS, 'font-normal text-ktip-sand-500')}
                  />
                </>
              )}
            </div>
            {rangeLine && (
              <p className={cn(CALENDAR_CHROME_CLASS, 'mt-1 truncate text-ktip-sand-500')}>
                {rangeLine}
              </p>
            )}
          </div>

          {/* Scale — which span you are looking at.
              `w-full order-last` on a phone: the four view buttons plus Today
              plus two arrows do not fit beside a month title, and letting them
              wrap mid-cluster split the group in a different place at every
              width. Given its own line the group stays whole, and the title
              keeps the row it shares with the arrows that move it. Above sm the
              order classes drop out and the two groups are one bar again. */}
          <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
            <Segmented
              value={view}
              onChange={onViewChange}
              label={t`Calendar view`}
              radius="sm"
              options={VIEWS.map((option) => ({
                value: option.value,
                label: i18n._(option.label),
              }))}
            />

            {/* Scale on the left, position on the right — the rule says the two
                groups do different jobs. Hidden once they are on separate rows,
                where the line would divide a group from nothing. */}
            <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-ktip-sand-300 sm:block" />
          </div>

          {/* Position — where in that span you are. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToday}
              className="rounded-neu-sm px-3 py-1.5 text-micro font-bold uppercase tracking-wider text-ktip-ocean-700 shadow-neu-sm transition-all active:translate-y-px active:shadow-neu-sm-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
            >
              <Trans>Today</Trans>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                aria-label={
                  view === 'day'
                    ? t`Previous day`
                    : view === 'week'
                      ? t`Previous week`
                      : view === 'year'
                        ? t`Previous year`
                        : t`Previous month`
                }
                className={STEP_BUTTON}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={onNext}
                aria-label={
                  view === 'day'
                    ? t`Next day`
                    : view === 'week'
                      ? t`Next week`
                      : view === 'year'
                        ? t`Next year`
                        : t`Next month`
                }
                className={STEP_BUTTON}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* The month and year grids print no clock times, so the control
                would sit there doing nothing visible */}
            {(view === 'week' || view === 'day') && (
              <Segmented
                value={use24 ? '24' : '12'}
                onChange={(next) => setUse24(next === '24')}
                label={t`Time format`}
                radius="sm"
                options={[
                  { value: '12', label: t`12h` },
                  { value: '24', label: t`24h` },
                ]}
              />
            )}

            {panel && (
              <button
                type="button"
                onClick={() => setPanelOpen((open) => !open)}
                aria-pressed={panelOpen}
                aria-label={panelOpen ? t`Hide the day panel` : t`Show the day panel`}
                className={cn(PANE_TOGGLE, 'hidden xl:flex')}
              >
                <PanelRight size={15} />
              </button>
            )}
          </div>
        </div>

        {toolbar && (
          <div className="border-t border-ktip-sand-200 px-4 py-3">{toolbar}</div>
        )}

        {children}
      </div>

      {/* Panel. Below xl there is no third column to collapse, so it simply
          stacks under the grid and the toggle does not apply */}
      {panel && (
        <aside
          data-tutorial={panelTutorial}
          className={cn(
            // flex, so the panel stretches the full height of the row and its
            // footer button can sit at the bottom rather than under the list
            'flex min-w-0 overflow-hidden border-t border-ktip-sand-200 xl:border-l xl:border-t-0',
            // visibility:hidden also takes it out of the a11y tree, which is
            // what a collapsed pane should be — but only where it can collapse
            !panelOpen && 'xl:pointer-events-none xl:invisible xl:border-l-0'
          )}
        >
          <div className="w-full xl:w-[20rem]">{panel}</div>
          {/* The fixed width is the open track's width, so the pane keeps its
              layout while the grid column animates shut around it */}
        </aside>
      )}
    </div>
  )
}

/**
 * The calendar frame: a mini-month and filter rail, the grid, and a detail
 * panel, in one ruled surface rather than three floating cards.
 *
 * Three panes at `xl`; below that the rail folds into a row under the header
 * and the panel drops beneath the grid. The frame owns the header, the view
 * switch and the time format, so switching views never changes the chrome.
 */
export function CalendarShell(props: CalendarShellProps) {
  return (
    <CalendarTimeFormatProvider>
      <CalendarShellInner {...props} />
    </CalendarTimeFormatProvider>
  )
}
