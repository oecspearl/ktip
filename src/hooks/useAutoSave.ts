import { createSignal, onCleanup } from 'solid-js'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions {
  delay?: number
  onSave: () => Promise<void>
}

export function useAutoSave(options: UseAutoSaveOptions) {
  const delay = options.delay ?? 5000
  const [status, setStatus] = createSignal<SaveStatus>('idle')
  let timeout: ReturnType<typeof setTimeout> | null = null
  let savedTimeout: ReturnType<typeof setTimeout> | null = null

  const trigger = () => {
    if (timeout) clearTimeout(timeout)
    if (savedTimeout) clearTimeout(savedTimeout)
    setStatus('idle')

    timeout = setTimeout(async () => {
      setStatus('saving')
      try {
        await options.onSave()
        setStatus('saved')
        savedTimeout = setTimeout(() => setStatus('idle'), 3000)
      } catch {
        setStatus('error')
      }
    }, delay)
  }

  const cancel = () => {
    if (timeout) clearTimeout(timeout)
    if (savedTimeout) clearTimeout(savedTimeout)
  }

  onCleanup(cancel)

  return { status, trigger, cancel }
}
