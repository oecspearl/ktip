import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal Web Speech wrapper for the tutorial's read-aloud button.
 * Feature-detected — callers hide the control when `supported` is false.
 */
export function useTTS() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  // Held separately so stop() can disarm the callback before cancel() fires
  // onend — otherwise cancelling would look like a finished utterance and
  // auto-mode would advance a step the user just navigated away from.
  const onEndRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    if (!supported) return
    onEndRef.current = null
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported || !text.trim()) {
        onEnd?.()
        return
      }
      onEndRef.current = null
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1
      utterance.pitch = 1
      onEndRef.current = onEnd ?? null
      utterance.onend = () => {
        setSpeaking(false)
        const cb = onEndRef.current
        onEndRef.current = null
        cb?.()
      }
      utterance.onerror = () => {
        setSpeaking(false)
        onEndRef.current = null
      }
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [supported]
  )

  // A leaked utterance keeps talking long after the overlay unmounts
  useEffect(() => {
    return () => {
      if (supported) {
        onEndRef.current = null
        window.speechSynthesis.cancel()
      }
    }
  }, [supported])

  return { supported, speaking, speak, stop }
}
