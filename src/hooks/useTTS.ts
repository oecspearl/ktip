import { useCallback, useEffect, useRef, useState } from 'react'
import { speak as serviceSpeak, speechSupported } from '../a11y/viridion'

/**
 * Read-aloud for the tutorial overlay, through the accessibility service: a
 * voice that matches the page's language, the member's reading speed and
 * chosen voice, and long steps split so Chrome does not cut them off.
 * Feature-detected — callers hide the control when `supported` is false.
 */
export function useTTS() {
  const supported = speechSupported()
  const [speaking, setSpeaking] = useState(false)
  // Cancelling disarms the callbacks, so it never looks like a finished
  // utterance and auto-mode never advances a step the user just left
  const cancelRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    cancelRef.current?.()
    setSpeaking(true)
    cancelRef.current = serviceSpeak(text, {
      lang: document.documentElement.lang || 'en',
      onEnd: () => {
        cancelRef.current = null
        setSpeaking(false)
        onEnd?.()
      },
      onError: () => {
        cancelRef.current = null
        setSpeaking(false)
      },
    })
  }, [])

  // A leaked utterance keeps talking long after the overlay unmounts
  useEffect(() => () => cancelRef.current?.(), [])

  return { supported, speaking, speak, stop }
}
