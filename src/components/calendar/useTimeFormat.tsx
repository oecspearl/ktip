import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const STORAGE_KEY = 'calendar:time-format'

interface TimeFormatValue {
  use24: boolean
  setUse24: (next: boolean) => void
}

/**
 * 12h/24h is a reading preference, not a property of any one calendar, so it
 * lives in context rather than being threaded through the shell, the grid, the
 * cluster rows and the day panel — four levels of props for one boolean.
 *
 * Defaults to 12h, which is what the platform showed before the toggle existed.
 */
const TimeFormatContext = createContext<TimeFormatValue>({ use24: false, setUse24: () => {} })

export function CalendarTimeFormatProvider({ children }: { children: React.ReactNode }) {
  const [use24, setUse24State] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '24'
    } catch {
      // Private-mode Safari throws on any localStorage access
      return false
    }
  })

  const setUse24 = useCallback((next: boolean) => {
    setUse24State(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '24' : '12')
    } catch {
      // A preference that cannot be persisted still applies for this session
    }
  }, [])

  const value = useMemo(() => ({ use24, setUse24 }), [use24, setUse24])

  return <TimeFormatContext.Provider value={value}>{children}</TimeFormatContext.Provider>
}

export function useTimeFormat(): TimeFormatValue {
  return useContext(TimeFormatContext)
}
