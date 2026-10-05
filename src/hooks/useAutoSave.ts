import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions {
  delay?: number
  onSave: () => Promise<void>
}

export function useAutoSave(options: UseAutoSaveOptions) {
  const delay = options.delay ?? 5000
  const [status, setStatus] = useState<SaveStatus>('idle')

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The save currently on the wire, if any. */
  const inFlightRef = useRef<Promise<unknown> | null>(null)

  // Keep the latest onSave in a ref so trigger() always calls the current
  // version without needing to be recreated on every render.
  const onSaveRef = useRef(options.onSave)
  onSaveRef.current = options.onSave

  const mutation = useMutation({
    mutationFn: async () => {
      await onSaveRef.current()
    },
  })

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
  }, [])

  /**
   * Resolves once no autosave is in flight. `cancel()` only stops a save that
   * has not started; one already sent can still land after whatever the
   * caller does next. Await this before a write that must come last, such as
   * submitting the thing being drafted.
   */
  const settled = useCallback(async () => {
    while (inFlightRef.current) {
      try {
        await inFlightRef.current
      } catch {
        // The save's own failure is reported through `status`.
      }
    }
  }, [])

  const trigger = useCallback(() => {
    cancel()
    setStatus('idle')

    timeoutRef.current = setTimeout(() => {
      // Registered synchronously, before any await, so that settled() called
      // the instant after this timer fires still sees it. Queued behind the
      // previous save: two overlapping upserts can land in either order.
      const prior = inFlightRef.current
      const run = (async () => {
        if (prior) await prior.catch(() => {})
        setStatus('saving')
        await mutation.mutateAsync()
      })()
      inFlightRef.current = run
      run.then(
        () => {
          setStatus('saved')
          savedTimeoutRef.current = setTimeout(() => setStatus('idle'), 3000)
        },
        () => setStatus('error')
      ).finally(() => {
        if (inFlightRef.current === run) inFlightRef.current = null
      })
    }, delay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel, delay])

  useEffect(() => cancel, [cancel])

  return { status, trigger, cancel, settled }
}
