import {
  ControlBar,
  FocusLayout,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { CaptionStrip } from './CaptionStrip'
import { cn } from '../../../lib/utils'
import { LIVEKIT_URL, type VenueRoomGrant } from '../../../hooks/useVenueRoomToken'
import type { RoomCameraMode } from '../../../lib/venue-room-layout'

/**
 * The real call, inside the frames AvStage was already drawing.
 *
 * AvStage has always rendered the *shape* of the call — a judging panel is nine
 * equal tiles, a keynote is one big frame with thumbnails, a team room is a row
 * of bubbles. This fills those shapes with actual video, and the shapes do not
 * move when it does. That was the point of building the placeholder that way.
 *
 * What this component does NOT do is decide anything. `canPublish` arrives in a
 * signed token from `venue_room_grant()`; passing `video`/`audio` below only
 * says whether to *try* publishing on connect. A client that lied about it would
 * be refused by the media server, which is the difference between a rule and a
 * convention.
 */
export function VenueCall({
  mode,
  token,
  grant,
  fill,
  className,
  onRecordingControl,
}: {
  mode: RoomCameraMode
  token: string
  grant: VenueRoomGrant
  fill?: boolean
  className?: string
  /**
   * The host's record button, passed in rather than rendered here.
   *
   * Recording is a property of the ROOM, not of this member's call — it keeps
   * running if the host closes their tab, and AvStage already owns the red dot
   * that says so. Putting the control next to the thing it controls, while
   * leaving the state where the room's own data lives, keeps one source of
   * truth.
   */
  onRecordingControl?: React.ReactNode
}) {
  // `huddle` is deliberately audio-only. It is the mode for people who are
  // working rather than watching, and it is also the cheapest: LiveKit bills
  // downstream bandwidth, and a room of nine cameras costs roughly seven times
  // a room of nine microphones. AvStage keeps drawing its bubbles over the top.
  const wantsVideo = mode === 'spotlight' || mode === 'grid'

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect
      // Publishing on connect only when the grant allows it. A listen-only room
      // or a full room hands back canPublish: false, and the camera never turns
      // on in the first place rather than turning on and being rejected.
      video={grant.can_publish && wantsVideo}
      audio={grant.can_publish}
      data-lk-theme="default"
      className={cn('flex min-h-0 flex-col gap-2', fill && 'flex-1', className)}
    >
      {/* Without this nobody hears anybody. It renders no UI. */}
      <RoomAudioRenderer />

      {wantsVideo && <CallStage mode={mode} fill={fill} />}

      {/* Inside LiveKitRoom on purpose: captions ride the room's own data
          channel, already authorised by the same signed token as the media. */}
      <CaptionStrip enabled />
      {onRecordingControl}

      {grant.can_publish && (
        <ControlBar
          variation="minimal"
          controls={{
            microphone: true,
            camera: wantsVideo,
            screenShare: wantsVideo,
            // Chat and leave are the room's own, not the call's: the room has a
            // chat panel already, and "leaving" is walking out of the room on
            // the venue map. Two of each would be two sources of truth.
            chat: false,
            leave: false,
            settings: true,
          }}
        />
      )}
    </LiveKitRoom>
  )
}

/**
 * The video layouts. Must be a child of LiveKitRoom — `useTracks` reads the room
 * off context, so calling it a level up returns nothing and renders an empty
 * grid, which looks exactly like "nobody has a camera on".
 */
function CallStage({ mode, fill }: { mode: RoomCameraMode; fill?: boolean }) {
  const tracks = useTracks(
    [
      // `withPlaceholder` keeps a tile for someone who is in the call with their
      // camera off. Dropping them would make the grid rearrange every time
      // anyone toggled, and would hide the fact that they are there at all.
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  if (tracks.length === 0) return null

  if (mode === 'grid') {
    return (
      <div className={cn('min-h-0', fill ? 'flex-1' : 'h-[22rem]')}>
        <GridLayout tracks={tracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
    )
  }

  // Spotlight. A screen share wins the big frame over a face — if somebody is
  // demoing, the demo is the thing everyone came to look at.
  const focus =
    tracks.find((track) => track.source === Track.Source.ScreenShare) ?? tracks[0]
  const rest = tracks.filter((track) => track !== focus)

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', fill && 'flex-1')}>
      <div className={cn('min-h-0 overflow-hidden rounded-xl', fill ? 'flex-1' : 'h-[18rem]')}>
        <FocusLayout trackRef={focus} />
      </div>
      {rest.length > 0 && (
        <div className="grid shrink-0 grid-cols-4 gap-2">
          {rest.slice(0, 4).map((track) => (
            <div
              key={`${track.participant.identity}:${track.source}`}
              className="aspect-video overflow-hidden rounded-lg"
            >
              <ParticipantTile trackRef={track} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
