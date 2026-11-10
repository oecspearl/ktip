import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import type { UiLang } from '../lib/i18n/protocol'
import { isSlowStart, isStale, pickVoice } from '../lib/captions/voice'
import { useSpeechUsage } from './useSpeechUsage'
import type { ResolvedCaption } from './useLiveCaptions'

/**
 * Translations read aloud in the listener's language, one line at a time.
 *
 * Rules the old read-aloud broke:
 *
 *   - Never my own words. The old one read every translated line, and my own
 *     lines were in that list, so anyone whose reading language differed from
 *     their speaking language heard themselves translated back.
 *   - A line that has fallen more than a few seconds behind the speaker is
 *     skipped instead of read, so the voice catches up rather than drifting.
 *
 * It does not touch anyone's volume. It says whose line it is reading
 * (`reading`), and useCallMixer, the one owner of every speaker's volume,
 * decides what that means. Two owners used to fight: this hook set a speaker
 * back to full volume after each line, undoing the mute that keeps their
 * original voice from a listener in another language.
 *
 * Voices come from speechSynthesis (captions/voice.ts picks one): free, no key.
 */

const SLOW_KEY = 'ktip.call.slowVoices'
/** Keep saying "reading" briefly after a line, so back-to-back lines do not pump the volume. */
const RESTORE_AFTER_MS = 1_200
const SEEN_LIMIT = 200

interface QueuedLine {
  id: string
  text: string
  identity: string
  at: number
}

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/**
 * Call from inside the tap that turns voice on. Phones (iOS always, Android
 * Chrome often) keep speechSynthesis silent until a user gesture has spoken
 * once, and the first translation arrives seconds after the tap, outside it.
 * A silent utterance spent inside the tap unlocks the rest.
 */
export function primeSpeechVoice() {
  if (!supported()) return
  try {
    const silent = new SpeechSynthesisUtterance(' ')
    silent.volume = 0
    window.speechSynthesis.speak(silent)
  } catch {
    // No voice engine at all: the subtitles still show.
  }
}

function loadSlow(): Set<string> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SLOW_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.filter((name) => typeof name === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveSlow(names: Set<string>) {
  try {
    sessionStorage.setItem(SLOW_KEY, JSON.stringify([...names]))
  } catch {
    // Blocked storage: the voice is re-measured next visit.
  }
}

export function useTranslationVoice({
  captions,
  enabled,
  lang,
}: {
  captions: ResolvedCaption[]
  enabled: boolean
  lang: UiLang
}): { reading: string | null } {
  const room = useRoomContext()
  // Characters read aloud, for the organiser's usage panel (199).
  const meterRead = useSpeechUsage(room?.name || undefined, 'read_aloud_chars')

  const seen = useRef(new Set<string>())
  const queue = useRef<QueuedLine[]>([])
  const busy = useRef(false)
  const slow = useRef<Set<string>>(loadSlow())
  // Whose translated line is playing, for the mixer. Null once the voice is quiet.
  const [reading, setReading] = useState<string | null>(null)
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang

  const restore = useCallback(() => {
    if (restoreTimer.current) clearTimeout(restoreTimer.current)
    restoreTimer.current = null
    setReading(null)
  }, [])

  const duck = useCallback((identity: string) => {
    if (restoreTimer.current) clearTimeout(restoreTimer.current)
    restoreTimer.current = null
    setReading(identity)
  }, [])

  const next = useCallback(() => {
    if (!supported()) return
    let line: QueuedLine | undefined
    while ((line = queue.current.shift())) {
      if (!isStale(line.at, Date.now())) break
    }
    if (!line) {
      busy.current = false
      restoreTimer.current = setTimeout(restore, RESTORE_AFTER_MS)
      return
    }

    busy.current = true
    const current = line
    const speakLang = langRef.current
    const utterance = new SpeechSynthesisUtterance(current.text)
    utterance.lang = speakLang
    const voice = pickVoice(window.speechSynthesis.getVoices(), speakLang, slow.current)
    if (voice) utterance.voice = voice
    utterance.rate = 1.05

    const queuedAt = performance.now()
    let finished = false
    // Chrome sometimes never fires `end` for a network voice. Without this the
    // queue would stop for the rest of the call.
    const guard = setTimeout(() => finish(), 3_000 + current.text.length * 90)
    function finish() {
      if (finished) return
      finished = true
      clearTimeout(guard)
      next()
    }
    utterance.onstart = () => {
      if (voice && isSlowStart(voice, performance.now() - queuedAt)) {
        slow.current.add(voice.name)
        saveSlow(slow.current)
      }
    }
    utterance.onend = finish
    utterance.onerror = finish

    duck(current.identity)
    window.speechSynthesis.speak(utterance)
    meterRead(current.text.length)
  }, [duck, restore, meterRead])

  useEffect(() => {
    if (!enabled || !supported()) return
    for (const caption of captions) {
      // Finished translations from other people, each once. A line already in
      // my language I hear from the speaker directly.
      if (caption.own || !caption.translated || seen.current.has(caption.id)) continue
      seen.current.add(caption.id)
      queue.current.push({ id: caption.id, text: caption.display, identity: caption.identity, at: caption.at })
    }
    if (seen.current.size > SEEN_LIMIT) seen.current = new Set([...seen.current].slice(-SEEN_LIMIT / 2))
    if (!busy.current && queue.current.length > 0) next()
  }, [captions, enabled, next])

  // Off, or leaving the call: stop talking and give the room its volume back.
  useEffect(() => {
    if (enabled) return
    queue.current = []
    busy.current = false
    if (supported()) window.speechSynthesis.cancel()
    restore()
  }, [enabled, restore])

  useEffect(
    () => () => {
      queue.current = []
      if (supported()) window.speechSynthesis.cancel()
      if (restoreTimer.current) clearTimeout(restoreTimer.current)
    },
    []
  )

  return { reading }
}
