import { useCallback, useMemo, useState } from 'react'
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

/**
 * Month-grid state shared by every calendar: visible month, selected day,
 * slide direction for the nav animation, and the full grid window (which spills
 * into the neighbouring months to fill complete weeks).
 */
export function useCalendarMonth() {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [direction, setDirection] = useState<'left' | 'right'>('left')

  const gridStart = useMemo(() => startOfWeek(monthDate), [monthDate])
  const gridEnd = useMemo(() => endOfWeek(endOfMonth(monthDate)), [monthDate])

  const goPrevMonth = useCallback(() => {
    setDirection('right')
    setMonthDate((m) => addMonths(m, -1))
  }, [])

  const goNextMonth = useCallback(() => {
    setDirection('left')
    setMonthDate((m) => addMonths(m, 1))
  }, [])

  const goToday = useCallback(() => {
    setDirection('left')
    setMonthDate(startOfMonth(new Date()))
    setSelectedDate(startOfDay(new Date()))
  }, [])

  return {
    monthDate,
    selectedDate,
    direction,
    gridStart,
    gridEnd,
    setSelectedDate,
    goPrevMonth,
    goNextMonth,
    goToday,
  }
}
