import { useMemo } from 'react'
import {
  LiveKitRoom,
  PreJoin,
  VideoConference,
  type LocalUserChoices,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { useLingui } from '@lingui/react/macro'
import {
  CallCaptionsProvider,
  CallTranslateBar,
  CaptionOverlay,
  TranslationNotice,
} from '../venue/room/CallCaptions'
import { LIVEKIT_ROOM_OPTIONS } from '../../lib/livekit-options'
import { LIVEKIT_URL } from '../../hooks/useVenueRoomToken'

/**
 * Camera and microphone check before a call.
 *
 * LiveKit's PreJoin, with its name box hidden: the name everyone sees comes
 * from the signed token, so a box that let you type another one would be a
 * box that did nothing. Nothing connects here, so no call minutes are spent
 * while someone hunts for the right microphone.
 */
export function MeetingPreJoin({
  displayName,
  onJoin,
}: {
  displayName: string
  onJoin: (choices: LocalUserChoices) => void
}) {
  const { t } = useLingui()
  return (
    <div data-lk-theme="default" className="rounded-2xl p-4 [&_#username]:hidden">
      <PreJoin
        defaults={{ username: displayName, videoEnabled: true, audioEnabled: true }}
        onValidate={() => true}
        onSubmit={onJoin}
        joinLabel={t`Join call`}
        micLabel={t`Microphone`}
        camLabel={t`Camera`}
        persistUserChoices
      />
    </div>
  )
}

/**
 * The live call: LiveKit's VideoConference layout (grid, focus on a screen
 * share, chat, device settings, leave) plus the venue's subtitles, laid on the
 * picture, and its language bar underneath.
 *
 * The token is the permission. This component only connects with it and
 * publishes what the person chose in the pre-join check.
 */
export function MeetingCall({
  token,
  choices,
  onLeave,
}: {
  token: string
  choices: LocalUserChoices
  onLeave: () => void
}) {
  // Stable objects: LiveKitRoom re-applies these whenever their identity
  // changes, which would toggle the camera on every render.
  const video = useMemo(
    () => (choices.videoEnabled ? { deviceId: choices.videoDeviceId || undefined } : false),
    [choices.videoEnabled, choices.videoDeviceId]
  )
  const audio = useMemo(
    () => (choices.audioEnabled ? { deviceId: choices.audioDeviceId || undefined } : false),
    [choices.audioEnabled, choices.audioDeviceId]
  )

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect
      options={LIVEKIT_ROOM_OPTIONS}
      video={video}
      audio={audio}
      onDisconnected={onLeave}
      data-lk-theme="default"
      className="flex flex-col gap-2 overflow-hidden rounded-2xl"
    >
      {/* Subtitles and language state ride the room's data channel,
          authorised by the same token. */}
      <CallCaptionsProvider>
        {/* VideoConference renders its own RoomAudioRenderer. A second one
            would play every voice twice. */}
        <div className="relative h-[70svh] min-h-80 @container">
          <VideoConference />
          {/* Lifted clear of VideoConference's own control bar along the bottom. */}
          <CaptionOverlay className="bottom-20" />
          <TranslationNotice />
        </div>
        <CallTranslateBar />
      </CallCaptionsProvider>
    </LiveKitRoom>
  )
}
