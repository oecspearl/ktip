import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useSpeakingParticipants,
  useTracks,
  type TrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { PhoneCall, Presentation, ScreenShare } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { CallCaptionsProvider, CaptionOverlay, SubtitleBand, TranslationOffer } from './CallCaptions'
import { CallDock, type CallSignals } from './CallDock'
import { BoardCanvas, useBoardShare } from './CallBoard'
import { CallPeopleProvider, CallTile, type CallPerson } from './CallTile'
import { BOARD_TRACK } from '../../../lib/call-board'
import { cn } from '../../../lib/utils'
import { reactionArt } from '../../../lib/reaction-emoji'
import { LIVEKIT_ROOM_OPTIONS } from '../../../lib/livekit-options'
import { LIVEKIT_URL, type VenueRoomGrant } from '../../../hooks/useVenueRoomToken'
import type { RoomCameraMode } from '../../../lib/venue-room-layout'
import type { FloatingReaction } from '../../../hooks/useRoomSignals'

/**
 * The real call, inside the frames AvStage was already drawing.
 *
 * Three shapes, decided by what is on screen rather than only by the room:
 *
 *   - Someone is sharing their screen: the screen takes the stage, the
 *     presenter's camera sits in its bottom-right corner, and everyone else is a
 *     column down the right. In every room with a call, huddles included.
 *   - Spotlight: whoever spoke last is big, everyone else in the same column.
 *   - Grid: equal tiles, for a judging panel.
 *
 * A workshop host can share a board instead of a screen (CallBoard.tsx). It
 * travels as a screen share, so it takes the same presentation layout.
 *
 * A huddle joins with cameras off (LiveKit bills downstream bandwidth, and a
 * huddle is people working, not watching). Everyone in it is a small tile,
 * with their photo until they turn their camera on.
 *
 * Tiles are ours (CallTile), not LiveKit's: a camera that is off shows the
 * person's profile photo and name, not a grey silhouette.
 *
 * What this component does NOT do is decide anything. `canPublish` arrives in a
 * signed token from `venue_room_grant()`; passing `video`/`audio` below only
 * says whether to *try* publishing on connect. A client that lied about it would
 * be refused by the media server, which is the difference between a rule and a
 * convention.
 */
/** Who has the stage with a share, for the room around the call. */
export interface CallSharer {
  name: string
  mine: boolean
  /** A board rather than a screen. */
  board: boolean
}

export function VenueCall({
  mode,
  token,
  grant,
  fill,
  className,
  translationAllowed = true,
  signals,
  allowBoard = false,
  onShareChange,
  people,
  onRecordingControl,
}: {
  mode: RoomCameraMode
  token: string
  grant: VenueRoomGrant
  fill?: boolean
  className?: string
  /** The organiser's per-room switch (207). Same-language subtitles stay on either way. */
  translationAllowed?: boolean
  /** Reactions and hands from the room's channel, plus what is floating right now. */
  signals?: CallSignals & { reactions: FloatingReaction[] }
  /** Offer "Share a board" (workshop rooms). */
  allowBoard?: boolean
  /** Told whenever a share starts, changes hands or ends, and null on leaving. */
  onShareChange?: (sharer: CallSharer | null) => void
  /** Names and photos by user id (the call identity), for camera-off tiles. */
  people?: ReadonlyMap<string, CallPerson>
  /**
   * The host's record button, passed in rather than rendered here.
   *
   * Recording is a property of the ROOM, not of this member's call — it keeps
   * running if the host closes their tab, and AvStage already owns the red dot
   * that says so. Putting the control next to the thing it controls, while
   * leaving the state where the room's own data lives, keeps one source of
   * truth.
   */
  onRecordingControl?: ReactNode
}) {
  // Spotlight and grid rooms turn the camera on as you join. A huddle offers
  // it, off, from the dock.
  const wantsVideo = mode === 'spotlight' || mode === 'grid'
  // Leaving the call is not leaving the room: chat, panels and the map stay.
  // Unmounting LiveKitRoom disconnects; mounting it again rejoins.
  const [inCall, setInCall] = useState(true)

  if (!inCall) return <LeftCall onRejoin={() => setInCall(true)} />

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect
      options={LIVEKIT_ROOM_OPTIONS}
      // Publishing on connect only when the grant allows it. A listen-only room
      // or a full room hands back canPublish: false, and the camera never turns
      // on in the first place rather than turning on and being rejected.
      video={grant.can_publish && wantsVideo}
      audio={grant.can_publish}
      data-lk-theme="default"
      // LiveKit's theme paints the room near-black. The card around it is the
      // site's navy, so the call sits on that instead of a black slab.
      className={cn('flex min-h-0 flex-col gap-2 bg-transparent!', fill && 'flex-1', className)}
    >
      <CallPeopleProvider people={people ?? NO_PEOPLE}>
      {/* Without this nobody hears anybody. It renders no UI. */}
      <RoomAudioRenderer />

      {/* Inside LiveKitRoom on purpose: subtitles and language state ride the
          room's own data channel, authorised by the same signed token. */}
      <CallCaptionsProvider translationAllowed={translationAllowed} canPublish={grant.can_publish}>
        <CallBody
          mode={mode}
          fill={fill}
          canPublish={grant.can_publish}
          signals={signals}
          allowBoard={allowBoard}
          onShareChange={onShareChange}
          onLeave={() => setInCall(false)}
        />
      </CallCaptionsProvider>
      {onRecordingControl}
      </CallPeopleProvider>
    </LiveKitRoom>
  )
}

const NO_PEOPLE: ReadonlyMap<string, CallPerson> = new Map()

function LeftCall({ onRejoin }: { onRejoin: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface bg-black/30 px-4 py-3 text-caption text-white/80">
      <span>
        <Trans>You left the call. You are still in the room.</Trans>
      </span>
      <button
        type="button"
        onClick={onRejoin}
        className="inline-flex items-center gap-1.5 rounded-control bg-ktip-tropical-500 px-3 py-1.5 text-label font-bold text-ktip-ink hover:bg-ktip-tropical-400"
      >
        <PhoneCall size={15} aria-hidden="true" />
        <Trans>Rejoin the call</Trans>
      </button>
    </div>
  )
}

/**
 * Everything inside the call. Must be a child of LiveKitRoom — `useTracks`
 * reads the room off context, so calling it a level up returns nothing and
 * renders an empty grid, which looks exactly like "nobody has a camera on".
 */
function CallBody({
  mode,
  fill,
  canPublish,
  signals,
  allowBoard,
  onShareChange,
  onLeave,
}: {
  mode: RoomCameraMode
  fill?: boolean
  canPublish: boolean
  signals?: CallSignals & { reactions: FloatingReaction[] }
  allowBoard: boolean
  onShareChange?: (sharer: CallSharer | null) => void
  onLeave: () => void
}) {
  const shell = useRef<HTMLDivElement>(null)
  const [columnHidden, setColumnHidden] = useState(false)
  const board = useBoardShare()

  const tracks = useTracks(
    [
      // `withPlaceholder` keeps a tile for someone who is in the call with their
      // camera off. Dropping them would make the layout jump every time anyone
      // toggled, and would hide the fact that they are there at all.
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )
  // The newest share wins if two people share at once.
  const screen = [...tracks].reverse().find(
    (track): track is TrackReference => track.source === Track.Source.ScreenShare && !!track.publication
  )
  const cameras = tracks.filter((track) => track.source === Track.Source.Camera)

  const sharer: CallSharer | null = screen
    ? {
        name: screen.participant.name || screen.participant.identity,
        mine: screen.participant.isLocal,
        board: screen.publication.trackName === BOARD_TRACK,
      }
    : null
  const sharerKey = sharer ? `${sharer.name}|${sharer.mine}|${sharer.board}` : ''
  const report = useRef(onShareChange)
  report.current = onShareChange
  useEffect(() => {
    report.current?.(sharer)
    // Keyed on the string: a new object every render is not a new sharer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharerKey])
  useEffect(() => () => report.current?.(null), [])

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void shell.current?.requestFullscreen?.().catch(() => {})
  }

  let stage: ReactNode
  if (screen)
    stage = (
      <PresentLayout
        screen={screen}
        cameras={cameras}
        columnHidden={columnHidden}
        fill={fill}
        boardCanvas={screen.participant.isLocal && sharer?.board ? board.canvas : null}
      />
    )
  else if (mode === 'huddle') stage = <HuddleStrip cameras={cameras} />
  else if (cameras.length === 0) stage = <SubtitleBand />
  else if (mode === 'grid') stage = <GridStage cameras={cameras} fill={fill} />
  else stage = <SpotlightLayout cameras={cameras} fill={fill} />

  return (
    <div
      ref={shell}
      className={cn(
        'relative flex min-h-0 flex-col gap-2 [&:fullscreen]:bg-ktip-ink [&:fullscreen]:p-4',
        fill && 'flex-1'
      )}
    >
      {stage}
      {signals && <FloatingReactions reactions={signals.reactions} />}
      <CallDock
        canPublish={canPublish}
        allowCamera
        signals={signals}
        sharing={!!screen}
        board={allowBoard ? board : undefined}
        columnHidden={columnHidden}
        onToggleColumn={() => setColumnHidden((hidden) => !hidden)}
        onFullscreen={fullscreen}
        onLeave={onLeave}
      />
    </div>
  )
}

const tileKey = (track: TrackReferenceOrPlaceholder) => `${track.participant.identity}:${track.source}`

/**
 * The presentation. The screen keeps its own shape (object-contain: a slide is
 * never cropped), the presenter stays visible in the corner, and the column
 * gives way to a strip under the screen on a phone.
 */
function PresentLayout({
  screen,
  cameras,
  columnHidden,
  fill,
  boardCanvas,
}: {
  screen: TrackReference
  cameras: TrackReferenceOrPlaceholder[]
  columnHidden: boolean
  fill?: boolean
  /** My own board, to draw on, in place of the video of it. */
  boardCanvas: HTMLCanvasElement | null
}) {
  const { t } = useLingui()
  const isBoard = screen.publication.trackName === BOARD_TRACK
  // The host drawing on their own board needs the corner the camera would take.
  const presenter = boardCanvas
    ? undefined
    : cameras.find((track) => track.participant.identity === screen.participant.identity)
  const others = cameras.filter((track) => track !== presenter)
  const showColumn = !columnHidden && others.length > 0
  const name = screen.participant.isLocal ? t`You` : screen.participant.name || screen.participant.identity

  return (
    <div className={cn('@container', fill && 'flex min-h-0 flex-1 flex-col')}>
      <div className={cn('grid gap-2', showColumn && '@2xl:grid-cols-[minmax(0,1fr)_10.5rem]', fill && 'min-h-0 flex-1')}>
        <div
          className={cn(
            'relative min-w-0 overflow-hidden rounded-control bg-black @container',
            fill ? 'min-h-48 h-full' : 'aspect-video'
          )}
        >
          {boardCanvas ? (
            <BoardCanvas canvas={boardCanvas} />
          ) : (
            <VideoTrack trackRef={screen} className="h-full w-full object-contain" />
          )}
          <span className="pointer-events-none absolute left-3 top-3 z-raised inline-flex items-center gap-1.5 rounded-control bg-black/60 px-2 py-1 text-micro font-semibold text-white">
            {isBoard ? <Presentation size={12} aria-hidden="true" /> : <ScreenShare size={12} aria-hidden="true" />}
            {isBoard
              ? screen.participant.isLocal
                ? t`You are sharing a board`
                : t`${name} is sharing a board`
              : screen.participant.isLocal
                ? t`You are sharing your screen`
                : t`${name} is sharing their screen`}
          </span>
          {presenter && (
            <div className="absolute bottom-3 right-3 z-raised aspect-[4/3] w-[24%] max-w-56 overflow-hidden rounded-control shadow-card ring-2 ring-white/90 @max-2xl:bottom-auto @max-2xl:right-2 @max-2xl:top-2 @max-2xl:w-[30%]">
              <CallTile trackRef={presenter} avatarSize={36} className="h-full w-full" />
            </div>
          )}
          <CaptionOverlay className="@2xl:left-3 @2xl:right-[calc(min(24%,14rem)+1.5rem)]" />
          <TranslationOffer className="left-3 right-auto top-12" />
        </div>
        {showColumn && <SideColumn tracks={others} />}
      </div>
    </div>
  )
}

/**
 * A huddle: everyone in the call as a small tile, in a row that scrolls, and
 * the subtitle band under it. A camera that is off shows the person's photo.
 */
function HuddleStrip({ cameras }: { cameras: TrackReferenceOrPlaceholder[] }) {
  const { t } = useLingui()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t`Everyone in the call`}>
        {cameras.map((track) => (
          <CallTile key={tileKey(track)} trackRef={track} avatarSize={44} className="aspect-[4/3] w-36 shrink-0 sm:w-42" />
        ))}
      </div>
      <SubtitleBand />
    </div>
  )
}

/** Whoever spoke last, big. Sticky: a pause does not throw the picture back. */
function SpotlightLayout({ cameras, fill }: { cameras: TrackReferenceOrPlaceholder[]; fill?: boolean }) {
  const speaking = useSpeakingParticipants()
  const [leadId, setLeadId] = useState<string | null>(null)
  useEffect(() => {
    const next = speaking.find((participant) => !participant.isLocal) ?? speaking[0]
    if (next) setLeadId(next.identity)
  }, [speaking])

  const lead =
    cameras.find((track) => track.participant.identity === leadId) ??
    cameras.find((track) => !track.participant.isLocal) ??
    cameras[0]
  const others = cameras.filter((track) => track !== lead)

  return (
    <div className={cn('@container', fill && 'flex min-h-0 flex-1 flex-col')}>
      <div className={cn('grid gap-2', others.length > 0 && '@2xl:grid-cols-[minmax(0,1fr)_10.5rem]', fill && 'min-h-0 flex-1')}>
        <div
          className={cn(
            'relative min-w-0 overflow-hidden rounded-control @container',
            fill ? 'min-h-48 h-full' : 'aspect-video'
          )}
        >
          <CallTile trackRef={lead} avatarSize={96} className="h-full w-full" />
          <CaptionOverlay />
          <TranslationOffer />
        </div>
        {others.length > 0 && <SideColumn tracks={others} />}
      </div>
    </div>
  )
}

/**
 * Everyone but the main picture. Beside it on a wide call, matching its height
 * and scrolling inside; under it as a strip on a narrow one.
 */
function SideColumn({ tracks }: { tracks: TrackReferenceOrPlaceholder[] }) {
  const { t } = useLingui()
  return (
    <div className="relative h-24 @2xl:h-auto" aria-label={t`Everyone else in the call`}>
      <div className="absolute inset-0 flex gap-2 overflow-auto @2xl:flex-col">
        {tracks.map((track) => (
          <CallTile
            key={tileKey(track)}
            trackRef={track}
            avatarSize={32}
            className="aspect-video h-full shrink-0 @2xl:h-auto @2xl:w-full"
          />
        ))}
      </div>
    </div>
  )
}

/** Equal tiles. Nobody is the main one, which is the point in a judging room. */
function GridStage({ cameras, fill }: { cameras: TrackReferenceOrPlaceholder[]; fill?: boolean }) {
  return (
    <div className={cn('relative min-h-0 @container', fill && 'flex-1')}>
      <div className={cn('grid grid-cols-2 content-start gap-2 @2xl:grid-cols-3', fill && 'h-full overflow-y-auto')}>
        {cameras.map((track) => (
          <CallTile key={tileKey(track)} trackRef={track} avatarSize={56} className="aspect-video" />
        ))}
      </div>
      <CaptionOverlay />
      <TranslationOffer />
    </div>
  )
}

/** Reactions rise over the picture for everyone in the room, then go. */
function FloatingReactions({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 top-0 z-raised overflow-hidden" aria-hidden="true">
      {reactions.map((reaction) => {
        const art = reactionArt(reaction.emoji)
        return (
          <span
            key={reaction.id}
            className="absolute bottom-0 animate-float-up text-3xl leading-none"
            style={{ left: `${8 + reaction.offset * 84}%` }}
          >
            {art ? <img src={art.src} alt="" width={36} height={36} className="h-9 w-9" /> : reaction.emoji}
          </span>
        )
      })}
    </div>
  )
}
