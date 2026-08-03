import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDataChannel, useLocalParticipant } from '@livekit/components-react'
import { useContentLanguage } from '../i18n/useContentLanguage'
import { request } from '../lib/i18n/batcher'
import { shouldTranslate } from '../lib/i18n/should-translate'
import { UI_LANGS, isUiLang, type UiLang } from '../lib/i18n/protocol'
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  type SpeechRecognizer,
} from '../lib/captions/speech'

/**
 * Live translated captions for a venue room.
 *
 * The shape, and why each half is where it is:
 *
 *   - Each speaker's own browser transcribes their OWN microphone. Clean audio,
 *     one known speaker, no diarisation, and the cost falls on the person
 *     talking rather than on every person listening.
 *   - The SPEAKER also pays for the translation, once, into the other two
 *     languages — then broadcasts all of them together. Translating on each
 *     listener instead would mean a room of twenty paying twenty times for the
 *     same sentence.
 *   - Transport is LiveKit's data channel rather than Supabase broadcast,
 *     because the call is already connected and the channel is already
 *     authorised by the same signed token. One fewer moving part, and captions
 *     cannot outlive the call they belong to.
 *
 * Two messages per utterance, not one. The original goes out the instant it is
 * final, so everyone sees *something* in about a second; the translations follow
 * when they land and swap in place. Waiting to send until the translation
 * returned would make every caption arrive late for everyone, including the
 * people who did not need it translated at all.
 *
 * Nothing here is stored. Captions are `store: false` through the translation
 * pipeline — spoken words in a room are exactly the kind of text migration 097's
 * comment says must not outlive the request — and the buffer below is a ring
 * that forgets.
 */

const TOPIC = 'ktip-captions'
const MAX_CAPTIONS = 8
const CAPTION_TTL_MS = 45_000
/** Long enough to be a sentence worth translating, short enough to still be live. */
const MIN_CAPTION_CHARS = 2

interface CaptionWire {
  v: 1
  id: string
  /** Present on the first message: the original, as spoken. */
  text?: string
  lang?: UiLang
  name?: string
  /** Present on the follow-up: the same utterance in every other language. */
  variants?: Partial<Record<UiLang, string>>
}

export interface Caption {
  id: string
  name: string
  lang: UiLang
  text: string
  variants: Partial<Record<UiLang, string>>
  at: number
}

export interface LiveCaptions {
  /** Newest last, already resolved into the reader's language. */
  captions: (Caption & { display: string; translated: boolean })[]
  /** The speaker's own in-progress text. Local only — never broadcast. */
  interim: string
  captioning: boolean
  toggleCaptioning: () => void
  supported: boolean
  error: string | null
}

export function useLiveCaptions(enabled: boolean): LiveCaptions {
  const { lang: contentLang } = useContentLanguage()
  const { localParticipant } = useLocalParticipant()
  const [captions, setCaptions] = useState<Caption[]>([])
  const [interim, setInterim] = useState('')
  const [captioning, setCaptioning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supported = isSpeechRecognitionSupported()

  const merge = useCallback((incoming: CaptionWire) => {
    setCaptions((current) => {
      const at = Date.now()
      const existing = current.find((caption) => caption.id === incoming.id)

      const next: Caption = existing
        ? {
            ...existing,
            // The follow-up carries only variants; it must not blank the text
            // that is already on screen.
            text: incoming.text ?? existing.text,
            variants: { ...existing.variants, ...(incoming.variants ?? {}) },
          }
        : {
            id: incoming.id,
            name: incoming.name ?? '',
            lang: isUiLang(incoming.lang) ? incoming.lang : 'en',
            text: incoming.text ?? '',
            variants: incoming.variants ?? {},
            at,
          }

      const others = current.filter((caption) => caption.id !== incoming.id)
      return [...others, next]
        .filter((caption) => at - caption.at < CAPTION_TTL_MS)
        .slice(-MAX_CAPTIONS)
    })
  }, [])

  const { send } = useDataChannel(TOPIC, (message) => {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(message.payload)) as CaptionWire
      if (parsed?.v !== 1 || typeof parsed.id !== 'string') return
      merge(parsed)
    } catch {
      // Someone else's topic, or a future version of this one. Ignoring an
      // unreadable caption is always right; there is nothing to recover.
    }
  })

  const publish = useCallback(
    (payload: CaptionWire) => {
      void send(new TextEncoder().encode(JSON.stringify(payload)), {
        // Captions are worth dropping under congestion. A late caption is worse
        // than a missing one, and the audio is the thing that must not stutter.
        reliable: false,
        topic: TOPIC,
      })
    },
    [send]
  )

  // Kept in a ref so the recogniser's callback never closes over a stale
  // language or a stale `send` — it is created once and lives for minutes.
  const publishRef = useRef(publish)
  publishRef.current = publish
  const langRef = useRef<UiLang>(contentLang)
  langRef.current = contentLang
  const nameRef = useRef('')
  nameRef.current = localParticipant?.name || ''

  const onFinal = useCallback((text: string) => {
    const spoken = langRef.current
    const id = `${Math.trunc(performance.now())}-${Math.trunc(Math.random() * 1e6)}`

    // Out immediately, untranslated. Everyone sees the sentence about a second
    // after it was said; the people who share the speaker's language are done.
    publishRef.current({ v: 1, id, text, lang: spoken, name: nameRef.current })
    // The speaker also sees their own line, because a data message does not
    // echo back to its sender.
    merge({ v: 1, id, text, lang: spoken, name: nameRef.current })

    if (!shouldTranslate(text)) return

    const targets = UI_LANGS.filter((target) => target !== spoken)
    void Promise.all(
      targets.map(async (target) => {
        const translated = await request(text, 'text', target, {
          from: spoken,
          // Spoken words leave no trace in the shared cache. See migration 097.
          store: false,
        })
        return [target, translated] as const
      })
    ).then((pairs) => {
      const variants: Partial<Record<UiLang, string>> = {}
      for (const [target, translated] of pairs) {
        // An unchanged string means the translation failed or was declined.
        // Sending it would tell every reader "this IS the French", which is a
        // lie; leaving it out lets them fall back to the original.
        if (translated && translated !== text) variants[target] = translated
      }
      if (Object.keys(variants).length === 0) return
      publishRef.current({ v: 1, id, variants })
      merge({ v: 1, id, variants })
    })
  }, [merge])

  const recognizerRef = useRef<SpeechRecognizer | null>(null)

  useEffect(() => {
    if (!captioning || !enabled) return

    const recognizer = createSpeechRecognizer({
      lang: langRef.current,
      onSegment: ({ text, final }) => {
        if (!final) {
          setInterim(text)
          return
        }
        setInterim('')
        if (text.length >= MIN_CAPTION_CHARS) onFinal(text)
      },
      onError: (reason) => setError(reason),
    })

    recognizerRef.current = recognizer
    recognizer.start()

    return () => {
      recognizer.stop()
      recognizerRef.current = null
      setInterim('')
    }
    // `contentLang` is a dependency on purpose: switching your own language
    // mid-call has to restart the recogniser, or you carry on being transcribed
    // as the language you are no longer speaking.
  }, [captioning, enabled, onFinal, contentLang])

  // Sweep expired lines even when nobody is talking, so the strip empties
  // instead of freezing on the last thing anyone said.
  useEffect(() => {
    if (captions.length === 0) return
    const timer = setInterval(() => {
      const now = Date.now()
      setCaptions((current) => current.filter((caption) => now - caption.at < CAPTION_TTL_MS))
    }, 5_000)
    return () => clearInterval(timer)
  }, [captions.length])

  const resolved = useMemo(
    () =>
      captions.map((caption) => {
        const translation = caption.variants[contentLang]
        const display = caption.lang === contentLang ? caption.text : translation ?? caption.text
        return { ...caption, display, translated: Boolean(translation) && caption.lang !== contentLang }
      }),
    [captions, contentLang]
  )

  return {
    captions: resolved,
    interim,
    captioning,
    toggleCaptioning: useCallback(() => setCaptioning((value) => !value), []),
    supported,
    error,
  }
}
