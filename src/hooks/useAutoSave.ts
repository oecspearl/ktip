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

  const trigger = useCallback(() => {
    cancel()
    setStatus('idle')

    timeoutRef.current = setTimeout(async () => {
      setStatus('saving')
      try {
        await mutation.mutateAsync()
        setStatus('saved')
        savedTimeoutRef.current = setTimeout(() => setStatus('idle'), 3000)
      } catch {
        setStatus('error')
      }
    }, delay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel, delay])

  useEffect(() => cancel, [cancel])

  return { status, trigger, cancel }
}
