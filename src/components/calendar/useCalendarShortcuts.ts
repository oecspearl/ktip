import { useEffect } from 'react'
import { shouldIgnoreSingleKey as shouldIgnore } from '@a11y-kit'

interface CalendarShortcutOptions {
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onEscape: () => void
  /** Omitted where there is nothing to create — the key is then inert */
  onNew?: () => void
  enabled?: boolean
}

/**
 * Keyboard navigation for the calendar. Bound to the document rather than the
 * shell because the grid is scrollable and rarely holds focus — requiring a
 * click into the grid first would make the shortcuts feel broken.
 */
export function useCalendarShortcuts({
  onPrev,
  onNext,
  onToday,
  onEscape,
  onNew,
  enabled = true,
}: CalendarShortcutOptions) {
  useEffect(() => {
    if (!enabled) return

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Escape still closes the detail while a field inside the panel has
        // focus — that is the one key a form does not own
        if ((event.target as HTMLElement | null)?.closest('[role="dialog"]')) return
        onEscape()
        return
      }
      if (shouldIgnore(event)) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          onPrev()
          break
        case 'ArrowRight':
          event.preventDefault()
          onNext()
          break
        case 't':
        case 'T':
          onToday()
          break
        case 'n':
        case 'N':
          if (!onNew) return
          event.preventDefault()
          onNew()
          break
        default:
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, onPrev, onNext, onToday, onEscape, onNew])
}
