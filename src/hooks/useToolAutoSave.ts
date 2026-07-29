import { useCallback, useEffect, useRef, useState } from 'react'

export type ToolSaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

interface UseToolAutoSaveOptions {
  /**
   * Persists the current document. Kept in a ref internally, so it may close
   * over render-scoped state freely — the timer, `beforeunload` handler and
   * unmount flush always call the most recent version.
   */
  save: () => Promise<void>
  /** Debounce before an edit triggers a save. */
  delay?: number
  /** When false, `schedule()` is a no-op (read-only / shared-view mode). */
  enabled?: boolean
}

/**
 * The autosave engine shared by the whiteboard, document and code panels.
 *
 * Consolidates what used to be four copies of the same block: a debounce timer,
 * refs mirroring render state for long-lived listeners, a `beforeunload` flush,
 * a Ctrl+S / Cmd+S handler, and a flush on unmount.
 */
export function useToolAutoSave({ save, delay = 1500, enabled = true }: UseToolAutoSaveOptions) {
  const [status, setStatus] = useState<ToolSaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const saveRef = useRef(save)
  saveRef.current = save
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mountedRef = useRef(true)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  /** Runs the save now, cancelling any pending debounce. */
  const saveNow = useCallback(async () => {
    clearTimer()
    if (!enabledRef.current) return
    if (mountedRef.current) setStatus('saving')
    try {
      await saveRef.current()
      if (mountedRef.current) {
        setStatus('saved')
        setLastSavedAt(new Date())
      }
    } catch {
      if (mountedRef.current) setStatus('error')
    }
  }, [clearTimer])

  const saveNowRef = useRef(saveNow)
  saveNowRef.current = saveNow

  /** Marks the document dirty and (re)starts the debounce. */
  const schedule = useCallback(() => {
    if (!enabledRef.current) return
    setStatus('unsaved')
    clearTimer()
    timerRef.current = setTimeout(() => {
      void saveNowRef.current()
    }, delay)
  }, [clearTimer, delay])

  // Ctrl+S / Cmd+S — save immediately instead of letting the browser
  // open its "save page" dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveNowRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Flush pending edits when the tab goes away. Fire-and-forget: the request
  // is dispatched synchronously even though the page will not wait for it.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!timerRef.current || !enabledRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = undefined
      saveRef.current().catch(() => {})
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Flush pending edits when navigating away from the panel.
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = undefined
        if (enabledRef.current) saveRef.current().catch(() => {})
      }
    }
  }, [])

  return { status, setStatus, lastSavedAt, schedule, saveNow, cancel: clearTimer }
}
