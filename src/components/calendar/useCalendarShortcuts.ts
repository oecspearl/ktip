import { useEffect } from 'react'

interface CalendarShortcutOptions {
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onEscape: () => void
  /** Omitted where there is nothing to create — the key is then inert */
  onNew?: () => void
  enabled?: boolean
}

/** Typing in a field, or inside an open dialog, is never a shortcut. */
function shouldIgnore(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return true
  const target = event.target as HTMLElement | null
  if (!target) return false
  if (target.isContentEditable) return true
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true
  return Boolean(target.closest('[role="dialog"]'))
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
