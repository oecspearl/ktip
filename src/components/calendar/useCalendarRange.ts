import { useCallback, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'

export type CalendarView = 'year' | 'month' | 'week' | 'day'

/** Parse a persisted view, defaulting anything unrecognised to the month grid. */
export function parseCalendarView(value: string | null): CalendarView {
  return value === 'week' || value === 'day' || value === 'year' ? value : 'month'
}

/**
 * Range state shared by every calendar: the visible view (month grid, week
 * time-grid or single day), the anchor date, the selected day, the slide
 * direction for the nav animation, and the full window to fetch — which in
 * month mode spills into the neighbouring months to fill complete weeks.
 */
export function useCalendarRange(initialView: CalendarView = 'month') {
  const [view, setViewState] = useState<CalendarView>(initialView)
  const [anchorDate, setAnchorDate] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [direction, setDirection] = useState<'left' | 'right'>('left')

  /** The month the grid renders — always the anchor's month. */
  const monthDate = useMemo(() => startOfMonth(anchorDate), [anchorDate])

  const gridStart = useMemo(() => {
    if (view === 'day') return startOfDay(anchorDate)
    if (view === 'week') return startOfWeek(anchorDate)
    if (view === 'year') return startOfWeek(startOfYear(anchorDate))
    return startOfWeek(monthDate)
  }, [view, anchorDate, monthDate])

  const gridEnd = useMemo(() => {
    if (view === 'day') return endOfDay(anchorDate)
    if (view === 'week') return endOfWeek(anchorDate)
    if (view === 'year') return endOfWeek(endOfYear(anchorDate))
    return endOfWeek(endOfMonth(monthDate))
  }, [view, anchorDate, monthDate])

  /** Re-anchor on the selected day so the switch keeps the user where they were. */
  const setView = useCallback(
    (next: CalendarView) => {
      setViewState(next)
      setAnchorDate(
        next === 'month'
          ? startOfMonth(selectedDate)
          : next === 'year'
            ? startOfYear(selectedDate)
            : startOfDay(selectedDate)
      )
    },
    [selectedDate]
  )

  const step = useCallback(
    (delta: -1 | 1) => {
      setDirection(delta === 1 ? 'left' : 'right')
      if (view === 'year') {
        setAnchorDate((d) => addYears(d, delta))
        return
      }
      if (view === 'month') {
        setAnchorDate((d) => addMonths(d, delta))
        return
      }
      // Carry the selection along, or the day panel would show a hidden day
      const shift = view === 'day' ? addDays : addWeeks
      setAnchorDate((d) => shift(d, delta))
      setSelectedDate((d) => shift(d, delta))
    },
    [view]
  )

  const goPrev = useCallback(() => step(-1), [step])
  const goNext = useCallback(() => step(1), [step])

  const goToday = useCallback(() => {
    const today = new Date()
    setDirection('left')
    setAnchorDate(
      view === 'month'
        ? startOfMonth(today)
        : view === 'year'
          ? startOfYear(today)
          : startOfDay(today)
    )
    setSelectedDate(startOfDay(today))
  }, [view])

  /**
   * Move to an arbitrary date — the mini-month reaches months the prev/next
   * arrows would take several presses to get to.
   */
  const jumpTo = useCallback(
    (date: Date) => {
      const day = startOfDay(date)
      setDirection(day < selectedDate ? 'right' : 'left')
      setAnchorDate(
        view === 'month' ? startOfMonth(day) : view === 'year' ? startOfYear(day) : day
      )
      setSelectedDate(day)
    },
    [view, selectedDate]
  )

  /**
   * Jump to the same point in another year. Keeps the month and day so the
   * view does not also change underneath the choice — picking 2027 from a July
   * week should land on that week of July 2027, not on the 1st of January.
   */
  const goToYear = useCallback(
    (year: number) => {
      setDirection(year < anchorDate.getFullYear() ? 'right' : 'left')
      setAnchorDate((d) => {
        const next = new Date(d)
        next.setFullYear(year)
        return next
      })
      setSelectedDate((d) => {
        const next = new Date(d)
        next.setFullYear(year)
        return next
      })
    },
    [anchorDate]
  )

  /**
   * Drop from the year view into one of its months. View, anchor and selection
   * have to move together — doing it as `jumpTo` then `setView` reads a stale
   * `selectedDate` out of the closure and lands on the wrong month.
   */
  const openMonth = useCallback((month: Date) => {
    setDirection('left')
    setViewState('month')
    setAnchorDate(startOfMonth(month))
    setSelectedDate(startOfDay(month))
  }, [])

  return {
    view,
    setView,
    openMonth,
    goToYear,
    anchorDate,
    monthDate,
    selectedDate,
    direction,
    gridStart,
    gridEnd,
    setSelectedDate,
    goPrev,
    goNext,
    goToday,
    jumpTo,
  }
}
