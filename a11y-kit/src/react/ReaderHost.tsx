import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { onRequest, type ReaderCommand } from '../core/events'
import { speechSupported } from '../core/speech/speak'
import { useA11yContext } from './context'
import { useA11ySettings } from './hooks'

const ReaderBar = lazy(() => import('./ReaderBar').then((m) => ({ default: m.ReaderBar })))

/**
 * Mounts the reading bar when the setting is on, or when the read shortcut
 * or voice command asks for it. Answers those requests only where the
 * browser can speak, so the shortcut list never offers what will not work.
 */
export function ReaderHost() {
  const { store } = useA11yContext()
  const { readerBar } = useA11ySettings(store)
  const [summoned, setSummoned] = useState(false)
  const [command, setCommand] = useState<{ n: number; cmd: ReaderCommand }>({ n: 0, cmd: 'toggle' })
  const supported = speechSupported()
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!supported) return
    return onRequest('read', (detail) => {
      const cmd = (detail as ReaderCommand | undefined) ?? 'toggle'
      // Stopping a reader that is not there needs no reader
      if ((cmd === 'stop' || cmd === 'pause') && !mountedRef.current) return
      setSummoned(true)
      setCommand((c) => ({ n: c.n + 1, cmd }))
    })
  }, [supported])

  const shown = supported && (readerBar || summoned)
  mountedRef.current = shown
  if (!shown) return null
  return (
    <Suspense fallback={null}>
      <ReaderBar
        command={command}
        onClose={() => {
          setSummoned(false)
          setCommand({ n: 0, cmd: 'toggle' })
          if (store.getSettings().readerBar) store.patch({ readerBar: false })
        }}
      />
    </Suspense>
  )
}
