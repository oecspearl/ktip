import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Hand, MicOff } from 'lucide-react'
import {
  VideoTrack,
  isTrackReference,
  useIsMuted,
  useIsSpeaking,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import { useSpeakerLang } from './CallCaptions'

/** Who a call identity is. The identity is the member's user id (venue_room_grant). */
export interface CallPerson {
  name: string | null
  avatar: string | null
}

interface CallPeople {
  people: ReadonlyMap<string, CallPerson>
  /** User ids with a hand up in this room. */
  hands: ReadonlySet<string>
}

const CallPeopleContext = createContext<CallPeople>({ people: new Map(), hands: new Set() })

export function CallPeopleProvider({
  people,
  hands,
  children,
}: {
  people: ReadonlyMap<string, CallPerson>
  hands?: readonly string[]
  children: ReactNode
}) {
  const handKey = (hands ?? []).join('|')
  const value = useMemo(
    () => ({ people, hands: new Set(hands ?? []) }),
    // The joined ids, not the array: a new array with the same hands is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, handKey]
  )
  return <CallPeopleContext.Provider value={value}>{children}</CallPeopleContext.Provider>
}

/**
 * One person in the call, drawn as the revamp's design draws a tile.
 *
 * Camera on: their video, filling the tile. Camera off: their profile photo on
 * a dark tile, the way they look everywhere else on the site, instead of
 * LiveKit's grey silhouette. Either way the bottom-left chip carries a
 * muted-microphone mark, their name and the language they speak, a green ring
 * shows who is talking, and a raised hand shows top left.
 */
export function CallTile({
  trackRef,
  avatarSize = 56,
  className,
}: {
  trackRef: TrackReferenceOrPlaceholder
  /** The photo's size when the camera is off. */
  avatarSize?: number
  className?: string
}) {
  const { t } = useLingui()
  const { people, hands } = useContext(CallPeopleContext)
  const participant = trackRef.participant
  const person = people.get(participant.identity)
  const name = person?.name || participant.name || t`Member`
  const lang = useSpeakerLang(participant.identity, participant.isLocal)

  const speaking = useIsSpeaking(participant)
  const cameraMuted = useIsMuted(trackRef)
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone })
  const showVideo = isTrackReference(trackRef) && !cameraMuted
  const mirrored = participant.isLocal && trackRef.source === Track.Source.Camera

  return (
    <div
      className={cn(
        'relative isolate flex items-center justify-center overflow-hidden rounded-surface @container',
        showVideo ? 'bg-black' : 'bg-[#10161F]',
        className
      )}
    >
      {showVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className={cn('absolute inset-0 h-full w-full object-cover', mirrored && '-scale-x-100')}
        />
      ) : (
        <DiamondAvatar src={person?.avatar ?? null} name={name} size={avatarSize} />
      )}
      {hands.has(participant.identity) && (
        <span className="absolute left-2 top-2 z-raised inline-flex h-5.5 items-center gap-1 rounded-sm bg-ktip-sun-400 px-2 text-micro font-bold text-ktip-ink">
          <Hand size={11} aria-hidden="true" />
          <Trans>Hand up</Trans>
        </span>
      )}
      <span className="absolute bottom-2 left-2 z-raised inline-flex h-6 max-w-[calc(100%-1rem)] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-sm bg-black/55 px-2 text-xs font-bold text-white">
        {micMuted && <MicOff size={11} className="shrink-0 text-red-300" aria-label={t`Microphone off`} />}
        <span className="truncate">{participant.isLocal ? t`You` : name}</span>
        {lang && <em className="text-micro font-extrabold not-italic tracking-wide text-white/65">{lang.toUpperCase()}</em>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 z-raised rounded-surface ring-2 ring-inset transition-colors duration-200',
          speaking ? 'ring-ktip-tropical-400' : 'ring-transparent'
        )}
      />
    </div>
  )
}
