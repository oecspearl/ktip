import type { ReactNode } from 'react'
import { Hand, Maximize, Mic, MicOff, PanelRightClose, PanelRightOpen, PhoneOff, Presentation, ScreenShare, Video, VideoOff } from 'lucide-react'
import { MediaDeviceMenu, useLocalParticipant, useTrackToggle } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { DOCK_BUTTON, LanguageButton, SpeakerStatus, SubtitlesToggle } from './CallCaptions'
import { ReactionFan } from './ReactionFan'

/**
 * The room's reactions and raised hands, from useRoomSignals. Optional: a call
 * outside a venue room (a coffee table) has no room channel to send them on.
 */
export interface CallSignals {
  react: (emoji: string) => void
  myHandUp: boolean
  setHand: (up: boolean) => void
}

/** The workshop board's switch, from useBoardShare. */
export interface BoardSwitch {
  on: boolean
  pending: boolean
  start: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Our own control bar, replacing LiveKit's.
 *
 * Left, what is happening to my words. Middle, everything I press: microphone
 * and camera (each with its device menu), share screen, subtitles, language,
 * reactions, hand, leave. Right, how the call is laid out.
 *
 * Must be inside <LiveKitRoom> and <CallCaptionsProvider>.
 */
export function CallDock({
  canPublish,
  allowCamera,
  signals,
  sharing,
  board,
  columnHidden,
  onToggleColumn,
  onFullscreen,
  onLeave,
}: {
  /** From the signed grant. A listener has no microphone, camera or share. */
  canPublish: boolean
  /** Every room's call offers the camera; huddles join with it off. */
  allowCamera: boolean
  signals?: CallSignals
  /** Someone's screen is up, so the people column can be hidden. */
  sharing: boolean
  /** Present in rooms that offer a board (workshops). */
  board?: BoardSwitch
  columnHidden: boolean
  onToggleColumn: () => void
  onFullscreen: () => void
  onLeave: () => void
}) {
  const { t } = useLingui()

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-3">
      <div className="flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-2">
        <SpeakerStatus />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {canPublish && (
          <DeviceToggle
            source={Track.Source.Microphone}
            kind="audioinput"
            on={<Mic size={18} aria-hidden="true" />}
            off={<MicOff size={18} aria-hidden="true" />}
            labelOn={t`Mute`}
            labelOff={t`Unmute`}
          />
        )}
        {canPublish && allowCamera && (
          <DeviceToggle
            source={Track.Source.Camera}
            kind="videoinput"
            on={<Video size={18} aria-hidden="true" />}
            off={<VideoOff size={18} aria-hidden="true" />}
            labelOn={t`Turn camera off`}
            labelOff={t`Turn camera on`}
          />
        )}
        {canPublish && <ShareToggle boardOn={!!board?.on} />}
        {canPublish && board && <BoardToggle board={board} />}
        <SubtitlesToggle variant="dock" />
        <LanguageButton variant="dock" />
        {signals && <ReactionFan onReact={signals.react} buttonClassName={DOCK_BUTTON} />}
        {signals && (
          <button
            type="button"
            aria-pressed={signals.myHandUp}
            aria-label={signals.myHandUp ? t`Lower your hand` : t`Raise your hand`}
            title={signals.myHandUp ? t`Lower your hand` : t`Raise your hand`}
            onClick={() => signals.setHand(!signals.myHandUp)}
            className={cn(DOCK_BUTTON, signals.myHandUp && 'border-ktip-sun-400 bg-ktip-sun-500 text-ktip-ink aria-pressed:border-ktip-sun-400 aria-pressed:bg-ktip-sun-500 aria-pressed:text-ktip-ink')}
          >
            <Hand size={18} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex h-10 items-center gap-1.5 rounded-control bg-red-600 px-3 text-label font-bold text-white transition-colors hover:bg-red-700"
        >
          <PhoneOff size={16} aria-hidden="true" />
          <Trans>Leave call</Trans>
        </button>
      </div>

      <div className="flex flex-1 basis-20 items-center justify-end gap-2">
        {sharing && (
          <button
            type="button"
            aria-pressed={columnHidden}
            aria-label={columnHidden ? t`Show everyone` : t`Hide everyone else`}
            title={columnHidden ? t`Show everyone` : t`Hide everyone else`}
            onClick={onToggleColumn}
            className={DOCK_BUTTON}
          >
            {columnHidden ? <PanelRightOpen size={18} aria-hidden="true" /> : <PanelRightClose size={18} aria-hidden="true" />}
          </button>
        )}
        <button type="button" aria-label={t`Full screen`} title={t`Full screen`} onClick={onFullscreen} className={DOCK_BUTTON}>
          <Maximize size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/** A microphone or camera button, with its device menu beside it. */
function DeviceToggle({
  source,
  kind,
  on,
  off,
  labelOn,
  labelOff,
}: {
  source: Track.Source.Microphone | Track.Source.Camera
  kind: MediaDeviceKind
  on: ReactNode
  off: ReactNode
  labelOn: string
  labelOff: string
}) {
  const { t } = useLingui()
  const { toggle, enabled, pending } = useTrackToggle({ source })
  const label = enabled ? labelOn : labelOff
  const menuLabel = kind === 'audioinput' ? t`Choose a microphone` : t`Choose a camera`
  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={pending}
        onClick={() => void toggle()}
        className={cn(
          DOCK_BUTTON,
          'rounded-r-none',
          !enabled && 'border-transparent bg-red-500/20 text-red-300 hover:bg-red-500/30'
        )}
      >
        {enabled ? on : off}
      </button>
      {/* LiveKit's own device picker, so device choice stays where it was. */}
      {/* Important modifiers: LiveKit's .lk-button rules would otherwise win. */}
      <MediaDeviceMenu
        kind={kind}
        aria-label={menuLabel}
        title={menuLabel}
        className="h-10! w-6! min-w-0! rounded-l-none! rounded-r-control! border! border-l-0! border-white/10! bg-white/10! px-0! text-white! hover:bg-white/15!"
      />
    </div>
  )
}

/** Share my screen. Captured with a "detail" hint so code and slides stay sharp. */
function ShareToggle({ boardOn }: { boardOn: boolean }) {
  const { t } = useLingui()
  const { toggle, enabled, pending } = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: false, contentHint: 'detail' },
  })
  // The board is a screen share too, so while it is up this button would read
  // as on and stopping it would take the board down. Stop the board first.
  const label = boardOn
    ? t`Stop sharing the board to share your screen`
    : enabled
      ? t`Stop sharing your screen`
      : t`Share your screen`
  return (
    <button
      type="button"
      aria-pressed={enabled && !boardOn}
      aria-label={label}
      title={label}
      disabled={pending || boardOn}
      onClick={() => void toggle()}
      className={DOCK_BUTTON}
    >
      <ScreenShare size={18} aria-hidden="true" />
    </button>
  )
}

/** Share a board: a chalkboard everyone sees like a shared screen. */
function BoardToggle({ board }: { board: BoardSwitch }) {
  const { t } = useLingui()
  const { isScreenShareEnabled } = useLocalParticipant()
  const blocked = isScreenShareEnabled && !board.on
  const label = board.on
    ? t`Stop sharing the board`
    : blocked
      ? t`Stop sharing your screen to share a board`
      : t`Share a board`
  return (
    <button
      type="button"
      aria-pressed={board.on}
      aria-label={label}
      title={label}
      disabled={board.pending || blocked}
      onClick={() => void (board.on ? board.stop() : board.start())}
      className={DOCK_BUTTON}
    >
      <Presentation size={18} aria-hidden="true" />
    </button>
  )
}
