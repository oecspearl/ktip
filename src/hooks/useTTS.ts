import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Score an available voice — higher is better.
 *
 * The browser's default pick is usually the worst one installed (Microsoft
 * David/Zira on Windows, the 1990s-sounding compact voices on macOS). Edge and
 * Chrome both expose far better cloud voices; they just have to be asked for.
 */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase()
  const lang = voice.lang.toLowerCase()
  if (!lang.startsWith('en')) return -1

  let score = 0
  // Edge's neural voices — "Microsoft Aria Online (Natural) - English (US)"
  if (name.includes('natural')) score += 100
  if (name.includes('online')) score += 40
  // Chrome's cloud voices
  if (name.includes('google')) score += 60
  // Apple's modern voices; "Siri" and "Premium"/"Enhanced" beat the compact set
  if (name.includes('siri') || name.includes('premium') || name.includes('enhanced')) score += 70
  // The known-bad legacy set
  if (/\b(david|zira|mark|hazel|george)\b/.test(name)) score -= 50
  if (/compact/.test(name)) score -= 40

  // Caribbean English sits closer to en-GB than en-US
  if (lang.startsWith('en-gb')) score += 12
  else if (lang.startsWith('en-us')) score += 8
  if (voice.default) score += 2

  return score
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -Infinity
  for (const voice of voices) {
    const score = scoreVoice(voice)
    if (score > bestScore) {
      bestScore = score
      best = voice
    }
  }
  return bestScore < 0 ? null : best
}

/**
 * Tutorial copy is written to be read, not spoken: bullet glyphs, blank lines
 * and en-dashes all come out as noise (or literal "bullet") in a screen voice.
 */
function toSpokenText(text: string): string {
  return text
    .replace(/[•·]\s*/g, '')
    .replace(/[–—]/g, ', ')
    .replace(/\s*\n\s*/g, '. ')
    .replace(/\.\s*\.\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Minimal Web Speech wrapper for the tutorial's read-aloud button.
 * Feature-detected — callers hide the control when `supported` is false.
 */
export function useTTS() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState(false)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  // Held separately so stop() can disarm the callback before cancel() fires
  // onend — otherwise cancelling would look like a finished utterance and
  // auto-mode would advance a step the user just navigated away from.
  const onEndRef = useRef<(() => void) | null>(null)

  // The voice list is populated asynchronously and can arrive after first paint
  useEffect(() => {
    if (!supported) return
    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices())
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    onEndRef.current = null
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      const spoken = supported ? toSpokenText(text) : ''
      if (!supported || !spoken) {
        onEnd?.()
        return
      }
      onEndRef.current = null
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(spoken)
      if (!voiceRef.current) voiceRef.current = pickVoice(window.speechSynthesis.getVoices())
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
        utterance.lang = voiceRef.current.lang
      }
      // Slightly under 1 reads as measured rather than rushed on neural voices
      utterance.rate = 0.95
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
