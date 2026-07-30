import { useCallback, useMemo, useState } from 'react'
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

export type CalendarView = 'month' | 'week'

/**
 * Range state shared by every calendar: the visible view (month grid or week
 * time-grid), the anchor date, the selected day, the slide direction for the
 * nav animation, and the full window to fetch — which in month mode spills into
 * the neighbouring months to fill complete weeks.
 */
export function useCalendarRange(initialView: CalendarView = 'month') {
  const [view, setViewState] = useState<CalendarView>(initialView)
  const [anchorDate, setAnchorDate] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [direction, setDirection] = useState<'left' | 'right'>('left')

  /** The month the grid renders — always the anchor's month. */
  const monthDate = useMemo(() => startOfMonth(anchorDate), [anchorDate])

  const gridStart = useMemo(
    () => (view === 'week' ? startOfWeek(anchorDate) : startOfWeek(monthDate)),
    [view, anchorDate, monthDate]
  )
  const gridEnd = useMemo(
    () => (view === 'week' ? endOfWeek(anchorDate) : endOfWeek(endOfMonth(monthDate))),
    [view, anchorDate, monthDate]
  )

  /** Re-anchor on the selected day so the switch keeps the user where they were. */
  const setView = useCallback(
    (next: CalendarView) => {
      setViewState(next)
      setAnchorDate(next === 'week' ? startOfDay(selectedDate) : startOfMonth(selectedDate))
    },
    [selectedDate]
  )

  const step = useCallback(
    (delta: -1 | 1) => {
      setDirection(delta === 1 ? 'left' : 'right')
      if (view === 'week') {
        // Carry the selection along, or the day panel would show a hidden day
        setAnchorDate((d) => addWeeks(d, delta))
        setSelectedDate((d) => addWeeks(d, delta))
      } else {
        setAnchorDate((d) => addMonths(d, delta))
      }
    },
    [view]
  )

  const goPrev = useCallback(() => step(-1), [step])
  const goNext = useCallback(() => step(1), [step])

  const goToday = useCallback(() => {
    const today = new Date()
    setDirection('left')
    setAnchorDate(view === 'week' ? startOfDay(today) : startOfMonth(today))
    setSelectedDate(startOfDay(today))
  }, [view])

  return {
    view,
    setView,
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
  }
}
