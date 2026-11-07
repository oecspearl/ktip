import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { acquireMic } from '@a11y-kit'
import { useDataChannel, useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { useContentLanguage } from '../i18n/useContentLanguage'
import { segmentSeconds } from '../lib/speech-usage'
import { useSpeechUsage } from './useSpeechUsage'
import { shouldTranslate } from '../lib/i18n/should-translate'
import { isUiLang, type UiLang } from '../lib/i18n/protocol'
import {
  canCaptionWithWhisper,
  captionEngine,
  createSpeechRecognizer,
  type CaptionEngine,
  type SpeechRecognizer,
  type SpeechSegment,
} from '../lib/captions/speech'
import { createWhisperRecognizer } from '../lib/captions/whisper-speech'
import { createCaptionChunker } from '../lib/captions/chunker'
import { translateCaption } from '../lib/captions/caption-translate'

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
 * Two messages per piece, not one. The original goes out the instant it is
 * settled, so everyone sees *something* in about a second; the translations
 * follow when they land and swap in place. Waiting to send until the
 * translation returned would make every caption arrive late for everyone,
 * including the people who did not need it translated at all.
 *
 * A piece is a few words, not a sentence: the browser engine sends words once
 * they stop changing (captions/chunker.ts), and Whisper cuts a phrase every
 * few seconds (whisper-speech-core.ts). Each piece is translated with the one
 * before it as context, in one request for every language
 * (api/captions/translate.ts).
 *
 * Nothing here is stored. Spoken words in a room are exactly the kind of text
 * migration 097's comment says must not outlive the request: the caption route
 * never touches the shared cache, and the buffer below is a ring that forgets.
 */

const TOPIC = 'ktip-captions'
// Pieces of a few words now, not whole sentences, so more of them are kept.
const MAX_CAPTIONS = 14
const CAPTION_TTL_MS = 45_000
/** Long enough to be a sentence worth translating, short enough to still be live. */
const MIN_CAPTION_CHARS = 2
/** A piece this recent is the same train of thought, and goes along as context. */
const CONTEXT_MS = 10_000

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
  /** browser: instant, free and unlimited. whisper: Firefox, or a browser whose own service is out of reach; a phrase late, a shared daily allowance (203). */
  engine: CaptionEngine | null
  error: string | null
}

/**
 * @param readerLang  Read captions in this language instead of the site's.
 *                    A listener in an English site can follow a keynote in
 *                    French without switching the whole site over. It never
 *                    changes the language the local speaker is captioned in.
 */
export function useLiveCaptions(enabled: boolean, readerLang?: UiLang): LiveCaptions {
  const { lang: contentLang } = useContentLanguage()
  const readLang: UiLang = readerLang ?? contentLang
  const { localParticipant } = useLocalParticipant()
  const [captions, setCaptions] = useState<Caption[]>([])
  const [interim, setInterim] = useState('')
  const [captioning, setCaptioning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // What the browser can do, decided once. The only change is one way: a
  // browser whose own speech service is out of reach moves to Whisper for the
  // rest of the visit.
  const [engine, setEngine] = useState<CaptionEngine | null>(() => captionEngine())
  const supported = engine !== null

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
  // The LiveKit room name is the venue room id (api/venue/room-token.ts), which
  // is what the organiser's usage ledger bills caption translation to.
  const room = useRoomContext()
  const roomIdRef = useRef('')
  roomIdRef.current = room?.name || ''
  // Seconds of speech captioned, for the organiser's usage panel (199).
  // Whisper captions are metered by the server instead (203), from the
  // duration Groq reports, so they are left out here.
  const meterSpeech = useSpeechUsage(
    engine === 'browser' ? room?.name || undefined : undefined,
    'caption_speech_seconds'
  )
  const segmentStart = useRef<number | null>(null)
  // The speaker's last piece, sent along with the next one so a sentence cut
  // in two still translates as one.
  const lastPiece = useRef<{ text: string; at: number } | null>(null)

  const onFinal = useCallback((text: string) => {
    const spoken = langRef.current
    const id = `${Math.trunc(performance.now())}-${Math.trunc(Math.random() * 1e6)}`
    const now = Date.now()
    const previous = lastPiece.current
    const context = previous && now - previous.at < CONTEXT_MS ? previous.text : undefined
    lastPiece.current = { text, at: now }

    // Out immediately, untranslated. Everyone sees the words about a second
    // after they were said; the people who share the speaker's language are done.
    publishRef.current({ v: 1, id, text, lang: spoken, name: nameRef.current })
    // The speaker also sees their own line, because a data message does not
    // echo back to its sender.
    merge({ v: 1, id, text, lang: spoken, name: nameRef.current })

    if (!shouldTranslate(text)) return

    // One request for every other language, and nothing is stored: spoken
    // words leave no trace in the shared cache (migration 097).
    void translateCaption({ text, from: spoken, context, roomId: roomIdRef.current || undefined }).then(
      (variants) => {
        // A language that did not come back is left out, so its readers keep
        // the original rather than being told it is the translation.
        if (Object.keys(variants).length === 0) return
        publishRef.current({ v: 1, id, variants })
        merge({ v: 1, id, variants })
      }
    )
  }, [merge])

  const recognizerRef = useRef<SpeechRecognizer | null>(null)

  useEffect(() => {
    if (!captioning || !enabled || !engine) return

    // Browser recognisers wait for a pause to call anything final, so settled
    // words go out in pieces while the speaker is still talking. Whisper
    // already sends a phrase every few seconds (whisper-speech-core.ts).
    const chunker = engine === 'browser' ? createCaptionChunker() : null

    const onSegment = ({ text, final }: SpeechSegment) => {
      if (!final) {
        if (segmentStart.current === null) segmentStart.current = Date.now()
        if (chunker) {
          const piece = chunker.interim(text, Date.now())
          if (piece && piece.length >= MIN_CAPTION_CHARS) onFinal(piece)
          setInterim(chunker.unsent(text))
        } else {
          setInterim(text)
        }
        return
      }
      // Browser captions meter speech time here; Whisper's server meters its own.
      if (engine === 'browser') meterSpeech(segmentSeconds(segmentStart.current, Date.now()))
      segmentStart.current = null
      setInterim('')
      const rest = chunker ? chunker.final(text) : text
      if (rest.length >= MIN_CAPTION_CHARS) onFinal(rest)
    }

    const roomName = roomIdRef.current
    const recognizer =
      engine === 'whisper'
        ? createWhisperRecognizer({
            lang: langRef.current,
            roomId: roomName,
            onSegment,
            // A fatal stop (allowance used up, not allowed here, no microphone)
            // turns the button off, so it says so. "Busy" only shows.
            onError: (reason, fatal) => {
              setError(reason)
              if (fatal) setCaptioning(false)
            },
          })
        : createSpeechRecognizer({
            lang: langRef.current,
            onSegment,
            onError: (_reason, failure) => {
              if (failure === 'unreachable' && canCaptionWithWhisper()) {
                // The browser's own speech service cannot be reached (Brave,
                // Opera, a blocked network). Whisper works from any browser
                // that can record, so captioning carries on there, a phrase
                // late. Changing the engine restarts this effect.
                setInterim('')
                setEngine('whisper')
                return
              }
              if (failure === 'transient') {
                setError('speech-error')
                return
              }
              setError(failure === 'no-mic' ? 'speech-no-mic' : 'speech-browser-unreachable')
              setCaptioning(false)
            },
          })
    setError(null)

    recognizerRef.current = recognizer
    // Captions outrank voice commands for the microphone: Chrome allows one
    // recognition session per page, and a second start would silently end
    // this one. Voice commands are told why and step aside.
    const releaseMic = acquireMic('captions', 10)
    recognizer.start()

    return () => {
      recognizer.stop()
      releaseMic?.()
      recognizerRef.current = null
      setInterim('')
    }
    // `contentLang` is a dependency on purpose: switching your own language
    // mid-call has to restart the recogniser, or you carry on being transcribed
    // as the language you are no longer speaking.
  }, [captioning, enabled, engine, onFinal, contentLang, meterSpeech])

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
        const translation = caption.variants[readLang]
        const display = caption.lang === readLang ? caption.text : translation ?? caption.text
        return { ...caption, display, translated: Boolean(translation) && caption.lang !== readLang }
      }),
    [captions, readLang]
  )

  return {
    captions: resolved,
    interim,
    captioning,
    toggleCaptioning: useCallback(() => setCaptioning((value) => !value), []),
    supported,
    engine,
    error,
  }
}
