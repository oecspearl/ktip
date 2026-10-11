import { lazy, Suspense, useEffect, useState } from 'react'
import { onRequest } from '../core/events'
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
  const [signal, setSignal] = useState(0)
  const supported = speechSupported()

  useEffect(() => {
    if (!supported) return
    return onRequest('read', () => {
      setSummoned(true)
      setSignal((n) => n + 1)
    })
  }, [supported])

  if (!supported || (!readerBar && !summoned)) return null
  return (
    <Suspense fallback={null}>
      <ReaderBar
        toggleSignal={signal}
        onClose={() => {
          setSummoned(false)
          setSignal(0)
          if (store.getSettings().readerBar) store.patch({ readerBar: false })
        }}
      />
    </Suspense>
  )
}
