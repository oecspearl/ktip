import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useConnectionState,
  useDataChannel,
  useRoomContext,
  useSpeakingParticipants,
} from '@livekit/components-react'
import { ConnectionState, RoomEvent, type RemoteParticipant } from 'livekit-client'
import { useContentLanguage } from '../i18n/useContentLanguage'
import { isUiLang, type UiLang } from '../lib/i18n/protocol'
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
 * Each member tells the call their language state over a reliable data
 * message (captions/followers.ts says why not participant attributes). A
 * message sent before someone joined never reaches them, so everyone answers a
 * newcomer directly when they arrive, and the newcomer announces itself once
 * connected. Nothing is stored server-side; the state lives as long as the call.
 *
 * Must be rendered inside <LiveKitRoom>.
 */

const PREF_KEY = 'ktip.call.language'
/** The caption strip's old preferences, read once so nobody loses a choice they made. */
const LEGACY_KEY = 'ktip.captions.prefs'

interface Prefs {
  lang?: UiLang
  choice?: FollowChoice
  /** Show the original under each translated line. */
  original?: boolean
}

function readPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || 'null')
    if (raw && typeof raw === 'object') {
      return {
        lang: isUiLang(raw.lang) ? raw.lang : undefined,
        choice: isFollowChoice(raw.choice) ? raw.choice : undefined,
        original: raw.original === true,
      }
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}')
    return {
      lang: isUiLang(legacy.lang) ? legacy.lang : undefined,
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
  /** The language I speak and read. Defaults to my content language. */
  lang: UiLang
  setLang: (lang: UiLang) => void
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
  const { lang: contentLang } = useContentLanguage()
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [paused, setPaused] = useState(false)
  const lang = prefs.lang ?? contentLang
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
    () => ({ speaks: lang, reads: lang, subs: wantsSubtitles(choice), paused }),
    [lang, choice, paused]
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
    if (offer && offer.speaks !== lang) return
    for (const participant of speaking) {
      if (participant.isLocal) continue
      const speaks = roster.get(participant.identity)?.speaks
      if (shouldOffer({ choice, myLang: lang, speakerLang: speaks, translationAllowed }) && speaks) {
        setOffer({ identity: participant.identity, name: participant.name || participant.identity, speaks })
        return
      }
    }
    // Switching my own language to theirs answers the question for me.
    if (offer) setOffer(null)
  }, [speaking, roster, choice, lang, translationAllowed, offer])

  return {
    lang,
    setLang: useCallback((next: UiLang) => update({ lang: next }), [update]),
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
