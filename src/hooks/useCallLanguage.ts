import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useConnectionState,
  useDataChannel,
  useRoomContext,
  useSpeakingParticipants,
} from '@livekit/components-react'
import { ConnectionState, RoomEvent, type RemoteParticipant } from 'livekit-client'
import { useLanguage } from '../i18n/LanguageContext'
import { type UiLang } from '../lib/i18n/protocol'
import {
  LANG_TOPIC,
  decodeLangState,
  encodeLangState,
  isFollowChoice,
  shouldOffer,
  wantsSubtitles,
  type CallLangState,
  type FollowChoice,
} from '../lib/captions/followers'

/**
 * What I speak and read in a call, what everyone else does, and whether to ask
 * me to follow someone in my own language.
 *
 * Both come from the site's language (the switch in the top bar), 2026-11-10.
 * A speaker sets nothing: they are subtitled in the language the site is in,
 * and can only pause it or, rarely, say they are speaking another one for
 * this call. A listener reads in the site's language, and when someone speaks
 * another one they choose: keep the original, or subtitles (and a voice) in
 * theirs. Changing the site's language changes the call's at once.
 *
 * Each member tells the call their language state over a reliable data
 * message (captions/followers.ts says why not participant attributes). A
 * message sent before someone joined never reaches them, so everyone answers a
 * newcomer directly when they arrive, and the newcomer announces itself once
 * connected. Nothing is stored server-side; the state lives as long as the call.
 *
 * Must be rendered inside <LiveKitRoom>.
 */

// v2 when the language moved to the site's own (2026-11-10): choices made
// under the old picker are dropped, so everyone is offered the choice afresh.
const PREF_KEY = 'ktip.call.language.v2'
/** How often my language state is re-sent to the call. */
const REANNOUNCE_MS = 10_000
/** The caption strip's old preferences, read once so nobody loses a choice they made. */
const LEGACY_KEY = 'ktip.captions.prefs'

interface Prefs {
  choice?: FollowChoice
  /** Show the original under each translated line. */
  original?: boolean
}

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      // A stored `lang` from before the site's language took over is ignored.
      return {
        choice: isFollowChoice(raw.choice) ? raw.choice : undefined,
        original: raw.original === true,
      }
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}')
    return {
      choice: legacy.voice === true ? 'voice' : undefined,
      original: legacy.original === true,
    }
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

/** Someone talking in another language, whom I have not yet been asked about. */
export interface OfferTarget {
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
  choice: FollowChoice
  setChoice: (choice: FollowChoice) => void
  showOriginal: boolean
  setShowOriginal: (on: boolean) => void
  /** My own captions, paused for everyone. Per call: a pause should not outlive it. */
  paused: boolean
  setPaused: (on: boolean) => void
  /** Everyone else's language state, by participant identity. */
  roster: ReadonlyMap<string, CallLangState>
  offer: OfferTarget | null
}

export function useCallLanguage(translationAllowed: boolean): CallLanguage {
  const { uiLang } = useLanguage()
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [paused, setPaused] = useState(false)
  // Per call on purpose: someone who presents in French once should not be
  // transcribed as French in every call after it.
  const [speakOverride, setSpeakOverride] = useState<UiLang | null>(null)
  const reads = uiLang
  const speaks = speakOverride ?? uiLang
  const choice = prefs.choice ?? 'ask'

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

  const { send } = useDataChannel(LANG_TOPIC, (message) => {
    const identity = message.from?.identity
    const state = decodeLangState(message.payload)
    if (!identity || !state) return
    setRoster((current) => {
      const next = new Map(current)
      next.set(identity, state)
      return next
    })
  })

  const mine = useMemo<CallLangState>(
    () => ({ speaks, reads, subs: wantsSubtitles(choice), paused }),
    [speaks, reads, choice, paused]
  )
  const mineRef = useRef(mine)
  mineRef.current = mine
  const sendRef = useRef(send)
  sendRef.current = send

  const announce = useCallback((to?: string[]) => {
    try {
      void sendRef
        .current(encodeLangState(mineRef.current), {
          reliable: true,
          topic: LANG_TOPIC,
          ...(to ? { destinationIdentities: to } : {}),
        })
        .catch(() => {})
    } catch {
      // Not connected yet. The Connected effect below sends it again.
    }
  }, [])

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
    const left = (participant: RemoteParticipant) =>
      setRoster((current) => {
        if (!current.has(participant.identity)) return current
        const next = new Map(current)
        next.delete(participant.identity)
        return next
      })
    room.on(RoomEvent.ParticipantConnected, joined)
    room.on(RoomEvent.ParticipantDisconnected, left)
    return () => {
      room.off(RoomEvent.ParticipantConnected, joined)
      room.off(RoomEvent.ParticipantDisconnected, left)
    }
  }, [room, announce])

  // ---- the offer: only once someone in another language actually talks ----
  const speaking = useSpeakingParticipants()
  const [offer, setOffer] = useState<OfferTarget | null>(null)

  useEffect(() => {
    if (choice !== 'ask' || !translationAllowed) {
      if (offer) setOffer(null)
      return
    }
    if (offer && offer.speaks !== reads) return
    for (const participant of speaking) {
      if (participant.isLocal) continue
      const theirs = roster.get(participant.identity)?.speaks
      if (shouldOffer({ choice, myLang: reads, speakerLang: theirs, translationAllowed }) && theirs) {
        setOffer({ identity: participant.identity, name: participant.name || participant.identity, speaks: theirs })
        return
      }
    }
    // Switching the site to their language answers the question for me.
    if (offer) setOffer(null)
  }, [speaking, roster, choice, reads, translationAllowed, offer])

  return {
    reads,
    speaks,
    setSpeaks: setSpeakOverride,
    choice,
    setChoice: useCallback((next: FollowChoice) => update({ choice: next }), [update]),
    showOriginal: prefs.original === true,
    setShowOriginal: useCallback((on: boolean) => update({ original: on }), [update]),
    paused,
    setPaused,
    roster,
    offer,
  }
}
