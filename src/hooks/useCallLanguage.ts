import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useConnectionState,
  useDataChannel,
  useRoomContext,
  useSpeakingParticipants,
} from '@livekit/components-react'
import { ConnectionState, RoomEvent, type RemoteParticipant } from 'livekit-client'
import { useLanguage } from '../i18n/LanguageContext'
import { useMyCallVoice } from './useMyGender'
import { type UiLang } from '../lib/i18n/protocol'
import {
  DEFAULT_FOREIGN,
  LANG_TOPIC,
  decodeLangState,
  encodeLangState,
  isForeignMode,
  shouldNotice,
  wantsAnySubtitles,
  type CallLangState,
  type CaptionStatus,
  type ForeignMode,
} from '../lib/captions/followers'

/**
 * What I speak and read in a call, what everyone else does, and whether to
 * tell me someone is being translated for me.
 *
 * Both come from the site's language (the switch in the top bar), 2026-11-10.
 * A speaker sets nothing: they are subtitled in the language the site is in,
 * and can only pause it or, rarely, say they are speaking another one for
 * this call. A listener reads in the site's language, and someone speaking
 * another one reaches them translated, as subtitles and a voice, unless they
 * chose otherwise (`foreign`). Changing the site's language changes the
 * call's at once.
 *
 * Translation used to wait for the listener to answer "Follow along in
 * French?". Until they did, nothing was translated and they heard the
 * original, which in a two-device test looked like translation not working at
 * all. Now it is on from the start, and the listener is told once.
 *
 * Each member tells the call their language state over a reliable data
 * message (captions/followers.ts says why not participant attributes). A
 * message sent before someone joined never reaches them, so everyone answers a
 * newcomer directly when they arrive, and the newcomer announces itself once
 * connected. Nothing is stored server-side; the state lives as long as the call.
 *
 * Must be rendered inside <LiveKitRoom>.
 */

// v3 when translation became the default (2026-11-10). A v2 "keep the
// original", often tapped before anyone knew what it did, is not carried over:
// everyone starts from the new default.
//
// v4 when subtitles for my own language became the default too (2026-11-10):
// two people in one language saw nothing of each other, and a v3 "off" was
// never a choice, only the old default written back.
const PREF_KEY = 'ktip.call.language.v4'
const V3_KEY = 'ktip.call.language.v3'
const V2_KEY = 'ktip.call.language.v2'
/** How often my language state is re-sent to the call. */
const REANNOUNCE_MS = 10_000
/** How long the "is being translated for you" notice stays up. */
const NOTICE_MS = 9_000

interface Prefs {
  foreign?: ForeignMode
  /** Subtitles for speakers of my own language too. */
  along?: boolean
  /** Show the original under each translated line. */
  original?: boolean
  /** My own words as subtitles on my own screen. On unless switched off. */
  own?: boolean
}

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      return {
        foreign: isForeignMode(raw.foreign) ? raw.foreign : undefined,
        along: typeof raw.along === 'boolean' ? raw.along : undefined,
        original: raw.original === true,
        own: raw.own === false ? false : undefined,
      }
    }
    // v3: everything but an "off" for same-language subtitles carries over.
    const v3 = JSON.parse(localStorage.getItem(V3_KEY) || 'null')
    if (v3 && typeof v3 === 'object') {
      return {
        foreign: isForeignMode(v3.foreign) ? v3.foreign : undefined,
        original: v3.original === true,
        own: v3.own === false ? false : undefined,
      }
    }
    // v2 answers that still mean something: subtitles-only keeps reading
    // along, as "Subtitles" did then. "Keep the original" and unanswered start
    // from the default.
    const v2 = JSON.parse(localStorage.getItem(V2_KEY) || 'null')
    if (v2 && typeof v2 === 'object') {
      if (v2.choice === 'captions') return { foreign: 'subtitles', along: true, original: v2.original === true }
      return { original: v2.original === true }
    }
    return {}
  } catch {
    return {}
  }
}

function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  } catch {
    // Private window or storage blocked: the choice lasts for this visit only.
  }
}

/** Someone talking in another language, being translated for me. */
export interface NoticeTarget {
  identity: string
  name: string
  speaks: UiLang
}

export interface CallLanguage {
  /** The language I read subtitles and hear voices in: the site's language. */
  reads: UiLang
  /** The language I am subtitled as. The site's language unless I said otherwise for this call. */
  speaks: UiLang
  /** Say I am speaking another language in this call. Null goes back to the site's. */
  setSpeaks: (lang: UiLang | null) => void
  /** What I get from someone speaking another language. */
  foreign: ForeignMode
  setForeign: (mode: ForeignMode) => void
  /** Subtitles for speakers of my own language too. */
  along: boolean
  setAlong: (on: boolean) => void
  showOriginal: boolean
  setShowOriginal: (on: boolean) => void
  /**
   * My own words show as subtitles on my screen. On by default: it is how a
   * speaker checks their own side works before asking why nobody can read them.
   */
  own: boolean
  setOwn: (on: boolean) => void
  /** My own captions, paused for everyone. Per call: a pause should not outlive it. */
  paused: boolean
  setPaused: (on: boolean) => void
  /** Everyone else's language state, by participant identity. */
  roster: ReadonlyMap<string, CallLangState>
  /** Shown once per call, the first time someone in another language talks. */
  notice: NoticeTarget | null
  dismissNotice: () => void
}

export function useCallLanguage(
  translationAllowed: boolean,
  /** What my recogniser is doing for my followers, worked out by the provider after the fact. */
  cap?: CaptionStatus
): CallLanguage {
  const { uiLang } = useLanguage()
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [paused, setPaused] = useState(false)
  // Per call on purpose: someone who presents in French once should not be
  // transcribed as French in every call after it.
  const [speakOverride, setSpeakOverride] = useState<UiLang | null>(null)
  const reads = uiLang
  const speaks = speakOverride ?? uiLang
  const foreign = prefs.foreign ?? DEFAULT_FOREIGN
  const along = prefs.along !== false

  const update = useCallback((patch: Prefs) => {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      writePrefs(next)
      return next
    })
  }, [])

  // ---- telling the call, and hearing from it ----
  const room = useRoomContext()
  const connection = useConnectionState()
  const [roster, setRoster] = useState<ReadonlyMap<string, CallLangState>>(() => new Map())
  // Who has told me their state. The first message from anyone gets my state
  // straight back: if they never heard my hello, they would otherwise wait up
  // to REANNOUNCE_MS to learn I want their words translated.
  const heardFrom = useRef(new Set<string>())
  const answerRef = useRef<(identity: string) => void>(() => {})

  // Sent straight through the room, and received through a handler that
  // never changes. useDataChannel builds a new sender every time its handler
  // changes, and that sender throws until an effect has run for it. With an
  // inline handler that was every render: a line sent in the gap was dropped,
  // and the error was swallowed. A language hello lost that way left a speaker not
  // knowing anyone wanted their words (2026-11-10).
  const onData = useCallback((message: { payload: Uint8Array; from?: { identity: string } }) => {
    const identity = message.from?.identity
    const state = decodeLangState(message.payload)
    if (!identity || !state) return
    if (!heardFrom.current.has(identity)) {
      heardFrom.current.add(identity)
      answerRef.current(identity)
    }
    setRoster((current) => {
      const next = new Map(current)
      next.set(identity, state)
      return next
    })
  }, [])
  useDataChannel(LANG_TOPIC, onData)

  // The voice my translated words are read in, from my profile (209).
  const voice = useMyCallVoice()
  const mine = useMemo<CallLangState>(
    () => ({
      speaks,
      reads,
      subs: wantsAnySubtitles(foreign, along),
      paused,
      foreign,
      along,
      ...(cap ? { cap } : {}),
      ...(voice ? { voice } : {}),
    }),
    [speaks, reads, foreign, along, paused, cap, voice]
  )
  const mineRef = useRef(mine)
  mineRef.current = mine
  const roomRef = useRef(room)
  roomRef.current = room

  const announce = useCallback((to?: string[]) => {
    try {
      void roomRef.current?.localParticipant
        .publishData(encodeLangState(mineRef.current) as Uint8Array<ArrayBuffer>, {
          reliable: true,
          topic: LANG_TOPIC,
          ...(to ? { destinationIdentities: to } : {}),
        })
        .catch(() => {})
    } catch {
      // Not connected yet. The Connected effect below sends it again.
    }
  }, [])
  answerRef.current = (identity) => announce([identity])

  useEffect(() => {
    if (connection === ConnectionState.Connected) announce()
  }, [connection, mine, announce])

  // Say it again every few seconds. A hello sent the instant someone joined
  // can land before their side is listening, and then the speaker never learns
  // that anyone wants a translation (Delon's first two-device test). A few
  // dozen bytes every ten seconds makes the roster heal itself.
  useEffect(() => {
    if (connection !== ConnectionState.Connected) return
    const timer = window.setInterval(() => announce(), REANNOUNCE_MS)
    return () => window.clearInterval(timer)
  }, [connection, announce])

  useEffect(() => {
    if (!room) return
    const joined = (participant: RemoteParticipant) => announce([participant.identity])
    const left = (participant: RemoteParticipant) => {
      heardFrom.current.delete(participant.identity)
      setRoster((current) => {
        if (!current.has(participant.identity)) return current
        const next = new Map(current)
        next.delete(participant.identity)
        return next
      })
    }
    room.on(RoomEvent.ParticipantConnected, joined)
    room.on(RoomEvent.ParticipantDisconnected, left)
    return () => {
      room.off(RoomEvent.ParticipantConnected, joined)
      room.off(RoomEvent.ParticipantDisconnected, left)
    }
  }, [room, announce])

  // ---- the notice: once per call, when someone in another language first talks ----
  const speaking = useSpeakingParticipants()
  const [notice, setNotice] = useState<NoticeTarget | null>(null)
  const noticed = useRef(false)

  useEffect(() => {
    if (noticed.current) return
    for (const participant of speaking) {
      if (participant.isLocal) continue
      const theirs = roster.get(participant.identity)?.speaks
      if (theirs && shouldNotice({ foreign, myLang: reads, speakerLang: theirs, translationAllowed })) {
        noticed.current = true
        setNotice({ identity: participant.identity, name: participant.name || participant.identity, speaks: theirs })
        return
      }
    }
  }, [speaking, roster, foreign, reads, translationAllowed])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Answering it, or switching the site to their language, closes it.
  useEffect(() => {
    if (notice && (foreign === 'original' || notice.speaks === reads)) setNotice(null)
  }, [notice, foreign, reads])

  return {
    reads,
    speaks,
    setSpeaks: setSpeakOverride,
    foreign,
    setForeign: useCallback((next: ForeignMode) => update({ foreign: next }), [update]),
    along,
    setAlong: useCallback((on: boolean) => update({ along: on }), [update]),
    showOriginal: prefs.original === true,
    setShowOriginal: useCallback((on: boolean) => update({ original: on }), [update]),
    own: prefs.own !== false,
    setOwn: useCallback((on: boolean) => update({ own: on }), [update]),
    paused,
    setPaused,
    roster,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
  }
}
