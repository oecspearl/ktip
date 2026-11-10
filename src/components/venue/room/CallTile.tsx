import { createContext, useContext, type ReactNode } from 'react'
import { MicOff } from 'lucide-react'
import {
  VideoTrack,
  isTrackReference,
  useIsMuted,
  useIsSpeaking,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { DiamondAvatar } from '../../ui/DiamondAvatar'

/** Who a call identity is. The identity is the member's user id (venue_room_grant). */
export interface CallPerson {
  name: string | null
  avatar: string | null
}

const CallPeopleContext = createContext<ReadonlyMap<string, CallPerson>>(new Map())

export function CallPeopleProvider({
  people,
  children,
}: {
  people: ReadonlyMap<string, CallPerson>
  children: ReactNode
}) {
  return <CallPeopleContext.Provider value={people}>{children}</CallPeopleContext.Provider>
}

/**
 * One person in the call.
 *
 * Camera on: their video, filling the tile. Camera off: their profile photo on
 * the card's own navy, the way they look everywhere else on the site, instead
 * of LiveKit's grey silhouette. Either way their name sits bottom left with a
 * muted-microphone mark, and a green ring shows who is talking.
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
  const people = useContext(CallPeopleContext)
  const participant = trackRef.participant
  const person = people.get(participant.identity)
  const name = person?.name || participant.name || t`Member`

  const speaking = useIsSpeaking(participant)
  const cameraMuted = useIsMuted(trackRef)
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone })
  const showVideo = isTrackReference(trackRef) && !cameraMuted
  const mirrored = participant.isLocal && trackRef.source === Track.Source.Camera

  return (
    <div
      className={cn(
        'relative isolate flex items-center justify-center overflow-hidden rounded-control bg-white/[0.06] @container',
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
      <span className="absolute bottom-1.5 left-1.5 z-raised inline-flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-control bg-black/55 px-1.5 py-0.5 text-micro font-semibold text-white">
        {micMuted && <MicOff size={11} className="shrink-0 text-red-300" aria-label={t`Microphone off`} />}
        <span className="truncate">{participant.isLocal ? t`${name} (you)` : name}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 z-raised rounded-control ring-2 ring-inset transition-colors duration-200',
          speaking ? 'ring-ktip-tropical-400' : 'ring-transparent'
        )}
      />
    </div>
  )
}
