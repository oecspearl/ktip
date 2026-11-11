import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { acquireMic } from '@a11y-kit'
import { useDataChannel, useLocalParticipant, useRoomContext } from '@livekit/components-react'
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
 * Live captions in a call: my words out, everyone else's in.
 *
 * The shape, and why each half is where it is:
 *
 *   - Each speaker's own browser transcribes their OWN microphone. Clean audio,
 *     one known speaker, no diarisation, and the cost falls on the person
 *     talking rather than on every person listening.
 *   - It does so only while somebody is following them (`transcribe`, worked
 *     out in CallCaptions from captions/followers.ts). Nobody presses a button
 *     to be captioned any more: the old "Caption my speech" toggle meant a
 *     listener got nothing unless the speaker had found it.
 *   - The SPEAKER pays for the translation, once, and only into the languages
 *     those followers read (`targets`), then broadcasts them together.
 *   - Transport is LiveKit's data channel, already authorised by the call's
 *     own signed token. Captions cannot outlive the call they belong to.
 *
 * Two messages per piece. The original goes out the instant it is settled, on
 * the lossy channel: a late caption is worse than a missing one, and the people
 * who share the speaker's language are done. The translations follow on the
 * RELIABLE channel, because a dropped one used to leave a listener reading the
 * original with no idea a translation had ever existed.
 *
 * My own lines are kept, marked `own`, for the record of what went out; they
 * are never shown to me as subtitles and never read aloud to me.
 *
 * Nothing here is stored. Spoken words are exactly the kind of text migration
 * 097 says must not outlive the request: the caption route never touches the
 * shared cache, and the buffer below is a ring that forgets.
 */

const TOPIC = 'ktip-captions'
const MAX_CAPTIONS = 14
const CAPTION_TTL_MS = 45_000
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
  /** Present on the follow-up: the same piece in the languages its listeners read. */
  variants?: Partial<Record<UiLang, string>>
  /**
   * On the first message: the speaker will not translate this piece (a number,
   * a name, one letter). A listener stops waiting for a translation of it.
   */
  plain?: boolean
}

export interface Caption {
  id: string
  /** The speaker's participant identity: who to turn down while their translation plays. */
  identity: string
  name: string
  lang: UiLang
  text: string
  variants: Partial<Record<UiLang, string>>
  at: number
  /** Mine. Never shown to me as a subtitle, never read aloud to me. */
  own: boolean
  /** Not translated on purpose (CaptionWire.plain). */
  plain: boolean
}

export interface ResolvedCaption extends Caption {
  /** What to show: the reader's language when there is one, else the original. */
  display: string
  translated: boolean
}

export interface LiveCaptions {
  /** Newest last, already resolved into the reader's language. */
  captions: ResolvedCaption[]
  /** My recogniser is running. */
  transcribing: boolean
  supported: boolean
  /** browser: instant, free and unlimited. whisper: Firefox, or a browser whose own service is out of reach. */
  engine: CaptionEngine | null
  error: string | null
  /** Why my last piece came back untranslated, until one comes back translated. */
  translationIssue: string | null
  /** The last run stopped on an error it cannot get past (allowance, microphone, service). */
  failed: boolean
}

export function useLiveCaptions({
  transcribe,
  followed,
  speaks,
  targets,
  reads,
}: {
  /** Run my recogniser: my microphone is on, I have not paused, and someone (or I) will read it. */
  transcribe: boolean
  /**
   * Someone else is following me. Whisper is metered against the
   * organisation's daily allowance, so it never runs just to show me my own
   * words; the browser's recogniser is free and may.
   */
  followed: boolean
  speaks: UiLang
  /** Languages to translate my words into. Empty: originals only. */
  targets: UiLang[]
  /** The language I read everyone else in. */
  reads: UiLang
}): LiveCaptions {
  const { localParticipant } = useLocalParticipant()
  const [captions, setCaptions] = useState<Caption[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [translationIssue, setTranslationIssue] = useState<string | null>(null)
  // A stop the recogniser cannot get past, as against a phrase lost on the way.
  const [failed, setFailed] = useState(false)

  // What the browser can do, decided once. The only change is one way: a
  // browser whose own speech service is out of reach moves to Whisper.
  const [engine, setEngine] = useState<CaptionEngine | null>(() => captionEngine())
  const supported = engine !== null

  const merge = useCallback((incoming: CaptionWire, identity: string, own: boolean) => {
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
            // The original can land after its translation: the original rides
            // the lossy channel, the translation the reliable one.
            name: existing.name || incoming.name || '',
            lang: isUiLang(incoming.lang) ? incoming.lang : existing.lang,
            plain: existing.plain || incoming.plain === true,
          }
        : {
            id: incoming.id,
            identity,
            name: incoming.name ?? '',
            lang: isUiLang(incoming.lang) ? incoming.lang : 'en',
            text: incoming.text ?? '',
            variants: incoming.variants ?? {},
            at,
            own,
            plain: incoming.plain === true,
          }
      const others = current.filter((caption) => caption.id !== incoming.id)
      return [...others, next].filter((caption) => at - caption.at < CAPTION_TTL_MS).slice(-MAX_CAPTIONS)
    })
  }, [])

  // Sent straight through the room, and received through a handler that
  // never changes. useDataChannel builds a new sender every time its handler
  // changes, and that sender throws until an effect has run for it. With an
  // inline handler that was every render: a line sent in the gap was dropped,
  // and the error was swallowed. Subtitles showed for the speaker and never
  // reached anyone else (2026-11-10).
  const room = useRoomContext()
  const onData = useCallback(
    (message: { payload: Uint8Array; from?: { identity: string } }) => {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(message.payload)) as CaptionWire
        if (parsed?.v !== 1 || typeof parsed.id !== 'string') return
        merge(parsed, message.from?.identity ?? '', false)
      } catch {
        // Someone else's topic, or a future version of this one. Ignoring an
        // unreadable caption is always right; there is nothing to recover.
      }
    },
    [merge]
  )
  useDataChannel(TOPIC, onData)

  const publish = useCallback(
    (payload: CaptionWire, reliable: boolean) => {
      try {
        void room?.localParticipant
          .publishData(new TextEncoder().encode(JSON.stringify(payload)), { reliable, topic: TOPIC })
          .catch(() => {})
      } catch {
        // Disconnected mid-sentence. The words were never going to arrive.
      }
    },
    [room]
  )

  // Refs, so the recogniser's callback (created once, alive for minutes) never
  // closes over a stale language, audience or `send`.
  const publishRef = useRef(publish)
  publishRef.current = publish
  const speaksRef = useRef<UiLang>(speaks)
  speaksRef.current = speaks
  const targetsRef = useRef<UiLang[]>(targets)
  targetsRef.current = targets
  const nameRef = useRef('')
  nameRef.current = localParticipant?.name || ''
  const identityRef = useRef('')
  identityRef.current = localParticipant?.identity || ''
  // The LiveKit room name is the venue room id (api/venue/room-token.ts): what
  // the usage ledger bills to, and what the translate route checks the
  // organiser's switch against.
  const roomIdRef = useRef('')
  roomIdRef.current = room?.name || ''
  // Seconds of speech captioned, for the organiser's usage panel (199). Whisper
  // is metered by the server instead (203), from the duration Groq reports.
  const meterSpeech = useSpeechUsage(engine === 'browser' ? room?.name || undefined : undefined, 'caption_speech_seconds')
  const segmentStart = useRef<number | null>(null)
  const lastPiece = useRef<{ text: string; at: number } | null>(null)

  const onFinal = useCallback(
    (text: string) => {
      const spoken = speaksRef.current
      const id = `${Math.trunc(performance.now())}-${Math.trunc(Math.random() * 1e6)}`
      const now = Date.now()
      const previous = lastPiece.current
      const context = previous && now - previous.at < CONTEXT_MS ? previous.text : undefined
      lastPiece.current = { text, at: now }

      const translatable = shouldTranslate(text)
      const original: CaptionWire = {
        v: 1,
        id,
        text,
        lang: spoken,
        name: nameRef.current,
        ...(translatable ? {} : { plain: true }),
      }
      // Reliable, like the language hello on the same call. The lossy channel
      // delivered nothing between two devices on 2026-11-10 while reliable
      // messages on the same call arrived; a subtitle a moment late beats none.
      publishRef.current(original, true)
      merge(original, identityRef.current, true)

      const to = targetsRef.current.filter((lang) => lang !== spoken)
      if (to.length === 0 || !translatable) return

      void translateCaption({ text, from: spoken, targets: to, context, roomId: roomIdRef.current || undefined }).then(
        ({ variants, degraded }) => {
          // A language that did not come back is left out, so its readers keep
          // the original rather than being told it is the translation.
          if (Object.keys(variants).length === 0) {
            // The organiser's switch already has its own line; anything else
            // the speaker should know about, since their listeners can only
            // see that the subtitle is still in the original.
            if (degraded && degraded !== 'room_off') setTranslationIssue(degraded)
            return
          }
          setTranslationIssue(null)
          // Language and name ride along: if the lossy original never
          // arrived, a listener still knows what it is reading and whose it is.
          const follow: CaptionWire = { v: 1, id, variants, lang: spoken, name: nameRef.current }
          publishRef.current(follow, true)
          merge(follow, identityRef.current, true)
        }
      )
    },
    [merge]
  )

  const recognizerRef = useRef<SpeechRecognizer | null>(null)

  useEffect(() => {
    if (!transcribe || !engine) return
    if (engine === 'whisper' && !followed) return

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
        }
        return
      }
      if (engine === 'browser') meterSpeech(segmentSeconds(segmentStart.current, Date.now()))
      segmentStart.current = null
      const rest = chunker ? chunker.final(text) : text
      if (rest.length >= MIN_CAPTION_CHARS) onFinal(rest)
    }

    const recognizer =
      engine === 'whisper'
        ? createWhisperRecognizer({
            lang: speaksRef.current,
            roomId: roomIdRef.current,
            onSegment,
            // A fatal stop (allowance used up, not allowed here, no microphone)
            // ends this run; "busy" only shows.
            onError: (reason, fatal) => {
              setError(reason)
              if (fatal) {
                setRunning(false)
                setFailed(true)
              }
            },
          })
        : createSpeechRecognizer({
            lang: speaksRef.current,
            onSegment,
            onError: (_reason, failure) => {
              if (failure === 'unreachable' && canCaptionWithWhisper()) {
                // The browser's own speech service cannot be reached (Brave,
                // Opera, a blocked network). Whisper works from any browser
                // that can record. Changing the engine restarts this effect.
                setEngine('whisper')
                return
              }
              if (failure === 'transient') {
                setError('speech-error')
                return
              }
              setError(failure === 'no-mic' ? 'speech-no-mic' : 'speech-browser-unreachable')
              setRunning(false)
              setFailed(true)
            },
          })
    setError(null)
    setFailed(false)
    setTranslationIssue(null)
    setRunning(true)
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
      setRunning(false)
    }
    // `speaks` is a dependency on purpose: changing the language you speak
    // mid-call restarts the recogniser, or you carry on being transcribed as
    // the language you no longer speak.
  }, [transcribe, followed, engine, onFinal, speaks, meterSpeech])

  // Sweep expired lines even when nobody is talking.
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
        const translation = caption.variants[reads]
        const display = caption.lang === reads ? caption.text : translation ?? caption.text
        return { ...caption, display, translated: Boolean(translation) && caption.lang !== reads }
      }),
    [captions, reads]
  )

  return { captions: resolved, transcribing: running, supported, engine, error, translationIssue, failed }
}
