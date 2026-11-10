import { useEffect, useMemo, useRef, useState } from 'react'
import { useRemoteParticipants, useSpeakingParticipants } from '@livekit/components-react'
import type { UiLang } from '../lib/i18n/protocol'
import {
  NO_CAPTION_GRACE_MS,
  UNTRANSLATED_GRACE_MS,
  awaitsTranslation,
  originalVolume,
  talkingWithoutCaptions,
  type CallLangState,
  type ForeignMode,
  type MixReason,
} from '../lib/captions/followers'
import { DUCKED_VOLUME } from '../lib/captions/voice'
import type { ResolvedCaption } from './useLiveCaptions'

/**
 * How loud each person in the call plays for me. The one place that sets a
 * remote participant's volume.
 *
 * A speaker in another language is muted for a listener who chose the
 * translated voice (the default), so only the translation reaches them
 * (followers.ts `originalVolume` has the rule and its fallbacks). Otherwise a
 * speaker plays at full volume, turned down only while their own translated
 * line is being read aloud (`reading`), which is the subtitles-with-voice case
 * after a fallback.
 *
 * Volume rather than unsubscribing: a fallback mid-sentence gives the voice
 * back at once, with no re-subscribe gap, and LiveKit still reports who is
 * speaking. RoomAudioRenderer is given no `volume` prop, so what is set here
 * sticks, and LiveKit re-applies it to a track that is published later.
 */

export interface MixEntry {
  volume: number
  reason: MixReason
}

export function useCallMixer({
  foreign,
  translationAllowed,
  reads,
  roster,
  captions,
  reading,
}: {
  foreign: ForeignMode
  translationAllowed: boolean
  reads: UiLang
  roster: ReadonlyMap<string, CallLangState>
  captions: ResolvedCaption[]
  /** Whose translated line is being read aloud right now. */
  reading: string | null
}): ReadonlyMap<string, MixEntry> {
  const remotes = useRemoteParticipants()

  // Each speaker's newest line, to tell when a translation is overdue.
  const newest = useMemo(() => {
    const byId = new Map<string, ResolvedCaption>()
    for (const caption of captions) if (!caption.own) byId.set(caption.identity, caption)
    return byId
  }, [captions])

  // When each person started talking after their last line arrived. LiveKit
  // reports who is speaking from the server, so this works with their voice
  // muted here. Cleared by their next line, not by a pause.
  const speaking = useSpeakingParticipants()
  const [waitingSince, setWaitingSince] = useState<ReadonlyMap<string, number>>(() => new Map())
  useEffect(() => {
    setWaitingSince((current) => {
      let next: Map<string, number> | null = null
      const edit = () => (next ??= new Map(current))
      for (const [identity, since] of current) {
        const at = newest.get(identity)?.at
        if (at !== undefined && at >= since) edit().delete(identity)
      }
      const at = Date.now()
      for (const participant of speaking) {
        if (participant.isLocal || (next ?? current).has(participant.identity)) continue
        edit().set(participant.identity, at)
      }
      return next ?? current
    })
  }, [speaking, newest])

  // Re-check exactly when a line still waiting for its translation, or someone
  // talking with nothing arriving, runs out of grace. No timer while nothing
  // is waiting.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const at = Date.now()
    const due: number[] = []
    for (const caption of newest.values()) {
      if (caption.lang === reads || caption.translated || caption.plain) continue
      // Already overdue as of the last check: the mix has it.
      if (now - caption.at > UNTRANSLATED_GRACE_MS) continue
      due.push(caption.at + UNTRANSLATED_GRACE_MS - at)
    }
    for (const since of waitingSince.values()) {
      if (now - since > NO_CAPTION_GRACE_MS) continue
      due.push(since + NO_CAPTION_GRACE_MS - at)
    }
    if (due.length === 0) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...due)) + 50)
    return () => window.clearTimeout(timer)
  }, [newest, waitingSince, reads, now])

  const mix = useMemo(() => {
    const entries = new Map<string, MixEntry>()
    for (const participant of remotes) {
      const identity = participant.identity
      const state = roster.get(identity)
      const line = newest.get(identity)
      const base = originalVolume({
        foreign,
        translationAllowed,
        reads,
        theirSpeaks: state?.speaks,
        theirCap: state?.cap,
        untranslated: awaitsTranslation(line, reads, now),
        noCaptions: talkingWithoutCaptions(waitingSince.get(identity), line?.at, now),
      })
      const ducked = base.volume > 0 && reading === identity
      entries.set(identity, { volume: ducked ? DUCKED_VOLUME : base.volume, reason: base.reason })
    }
    return entries
  }, [remotes, roster, foreign, translationAllowed, reads, newest, waitingSince, reading, now])

  const live = useRef(remotes)
  useEffect(() => {
    live.current = remotes
    for (const participant of remotes) {
      const entry = mix.get(participant.identity)
      if (entry && participant.getVolume() !== entry.volume) participant.setVolume(entry.volume)
    }
  }, [remotes, mix])

  // Leaving the call: nobody stays muted on the way out.
  useEffect(
    () => () => {
      for (const participant of live.current) participant.setVolume(1)
    },
    []
  )

  return mix
}
