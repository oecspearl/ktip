import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { onRequest } from '../../core/events'
import { recognitionSupported } from '../../core/speech/recognizer'
import { useA11yContext } from '../context'
import { useA11yDevice, useA11ySettings } from '../hooks'

const VoiceController = lazy(() => import('./VoiceController').then((m) => ({ default: m.VoiceController })))
const VoiceConsentDialog = lazy(() => import('./VoiceDialogs').then((m) => ({ default: m.VoiceConsentDialog })))

/**
 * Decides whether voice commands run on this device.
 *
 * The setting follows the member between devices; consent does not. It
 * names the browser vendor that processes the audio, and that differs per
 * device, so a device that has not agreed never listens, whatever the
 * synced setting says. Asking happens on the first Alt+Shift+V, microphone
 * press or switch-on.
 */
export function VoiceHost() {
  const { store } = useA11yContext()
  const { voiceNav } = useA11ySettings(store)
  const { voiceConsentAt } = useA11yDevice(store)
  const supported = recognitionSupported()
  const [asking, setAsking] = useState(false)
  const [listenSignal, setListenSignal] = useState(0)
  // Whether the request that opened the consent dialog wanted to listen at once
  const listenAfterConsent = useRef(false)

  useEffect(() => {
    if (!supported) return
    return onRequest('voice', (detail) => {
      const { settings, device } = store.getState()
      const wantsListen = detail !== 'enable'
      if (!device.voiceConsentAt) {
        listenAfterConsent.current = wantsListen
        setAsking(true)
        return
      }
      if (!settings.voiceNav) store.patch({ voiceNav: true })
      if (wantsListen) setListenSignal((n) => n + 1)
    })
  }, [supported, store])

  if (!supported) return null
  return (
    <>
      {asking && (
        <Suspense fallback={null}>
          <VoiceConsentDialog
            onAnswer={(yes) => {
              setAsking(false)
              if (!yes) return
              store.patchDevice({ voiceConsentAt: new Date().toISOString() })
              store.patch({ voiceNav: true })
              if (listenAfterConsent.current) setListenSignal((n) => n + 1)
            }}
          />
        </Suspense>
      )}
      {voiceNav && voiceConsentAt && (
        <Suspense fallback={null}>
          <VoiceController listenSignal={listenSignal} />
        </Suspense>
      )}
    </>
  )
}
