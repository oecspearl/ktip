import { useCallback, useEffect, useRef, useState } from 'react'
import { langPrefix, speakText, speechSupported } from '@a11y-kit'
import { a11yStore } from '../a11y/store'

/**
 * Read-aloud for the tutorial overlay, on the accessibility kit's speech
 * layer: a voice that matches the page's language (French and Spanish pages
 * used to get an English voice or none), the member's reading speed and
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
    const lang = document.documentElement.lang || 'en'
    const { settings, device } = a11yStore.getState()
    setSpeaking(true)
    cancelRef.current = speakText(text, {
      lang,
      rate: settings.ttsRate,
      voiceURI: device.ttsVoice[langPrefix(lang)],
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
