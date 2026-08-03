import { MicOff, Radio, ScreenShare, Video, VideoOff } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { VENUE_AUDIO_MODE_LABELS } from '../../../lib/constants'
import { ROOM_CAMERA_LABELS, type RoomCameraMode } from '../../../lib/venue-room-layout'
import { isVenueVideoConfigured, useVenueRoomToken } from '../../../hooks/useVenueRoomToken'
import { useRoomRecording } from '../../../hooks/useRoomRecording'
import { RecordingConsent, useRecordingConsent } from './RecordingConsent'
import { VenueCall } from './VenueCall'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import type { VenueOccupant, VenueRoom } from '../../../types'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Where the call goes.
 *
 * Two states, and the second one is the point of how the first was built. When
 * LiveKit is configured and this member has a grant, <VenueCall> renders real
 * tiles into these frames. When it is not — no project provisioned, a room set
 * to `off`, a grant still in flight, or a member who was refused — the original
 * placeholder tiles stay, seeded from the people actually standing in the room.
 *
 * The shapes were always the call's shapes: a judging panel is nine equal tiles,
 * a keynote is one big frame with thumbnails, a team room is a row of bubbles,
 * a quiet breakout has no call at all. Drawing all four as the same grey box
 * taught the host nothing and made every room look identical before anyone
 * spoke — and it meant nothing moved on the day video arrived.
 *
 * Nothing here decides who may speak. `can_publish` comes back inside a signed
 * token from venue_room_grant() (migration 101); this component only reports it.
 */
export function AvStage({
  room,
  mode,
  occupants,
  presenter,
  fill,
}: {
  room: VenueRoom
  mode: RoomCameraMode
  /** Everyone in this room, for seeding the tiles. */
  occupants: VenueOccupant[]
  /** Whoever is presenting right now, if anyone. */
  presenter?: { userId: string; name: string } | null
  /** True when the layout gave this the hero cell and it should fill it. */
  fill?: boolean
}) {
  const { t } = useLingui()
  // `mode === 'off'` must not connect. A LiveKit connection is billed by the
  // minute whether or not anyone speaks, so a room the host switched the call
  // off in opens no socket at all — the hook is disabled, not just unrendered.
  const live = mode !== 'off'

  // Consent gates the CONNECTION, not the notice. Nothing is published — no
  // camera, no microphone — until this member has been told the room is
  // recorded and said yes. A red dot after the fact is not a choice.
  const { acknowledged, acknowledge } = useRecordingConsent(room.id, Boolean(room.recording_enabled))

  const { token, grant, error } = useVenueRoomToken(room.id, live && acknowledged)
  const recording = useRoomRecording(room.id, Boolean(grant?.is_host))

  if (mode === 'off') return null

  const needsConsent = Boolean(room.recording_enabled) && !acknowledged
  const connected = Boolean(token && grant) && !needsConsent

  // max_publishers has been on the row since 070 and has never been read. It is
  // exactly the tile budget: how many people this room lets speak at once.
  const budget = Math.max(1, Math.trunc(Number(room.max_publishers) || 12))
  const cap = mode === 'grid' ? Math.min(budget, 9) : mode === 'huddle' ? Math.min(budget, 8) : 4

  const lead = presenter
    ? occupants.find((o) => o.user_id === presenter.userId) || null
    : occupants[0] || null
  const rest = occupants.filter((o) => o.user_id !== lead?.user_id)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-ktip-sand-200 bg-ktip-ink text-white shadow-card',
        fill && 'flex h-full flex-col'
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Video size={14} className="shrink-0 text-white/60" aria-hidden="true" />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-white/70">
          {presenter ? t`${presenter.name} is presenting` : ROOM_CAMERA_LABELS[mode]}
        </span>
        {/* Two different claims, and conflating them was the old bug: a room
            that MAY be recorded is not a room that IS being recorded. Only a
            host can see the live state (they are the only one who may ask
            LiveKit), so everyone else gets the honest weaker statement — which
            is also what they already consented to. */}
        {room.recording_enabled && (
          <span
            className={cn(
              'ml-auto flex shrink-0 items-center gap-1 text-micro font-semibold uppercase tracking-wider',
              recording.recording ? 'text-red-300' : 'text-white/40'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                recording.recording ? 'animate-pulse bg-red-400' : 'bg-white/30'
              )}
              aria-hidden="true"
            />
            {recording.recording ? <Trans>Recording</Trans> : <Trans>Can be recorded</Trans>}
          </span>
        )}
      </div>

      <div className={cn('p-3', fill && 'flex min-h-0 flex-1 flex-col')}>
        {needsConsent ? (
          <RecordingConsent onAccept={acknowledge} />
        ) : connected && token && grant ? (
          <>
            <VenueCall
              mode={mode}
              token={token}
              grant={grant}
              fill={fill}
              onRecordingControl={
                grant.is_host ? (
                  <RecordButton
                    recording={recording.recording}
                    busy={recording.busy}
                    error={recording.error}
                    onStart={() => void recording.startRecording()}
                    onStop={() => void recording.stopRecording()}
                  />
                ) : undefined
              }
            />
            {/* Huddle is audio-only, so VenueCall renders no video. The bubbles
                stay: they are how you can see who is actually in here. */}
            {mode === 'huddle' && (
              <HuddleStage people={[lead, ...rest].filter(Boolean) as VenueOccupant[]} cap={cap} />
            )}
          </>
        ) : (
          <>
            {mode === 'spotlight' && (
              <SpotlightStage lead={lead} rest={rest} presenter={presenter} cap={cap} fill={fill} />
            )}
            {mode === 'grid' && <GridStage people={[lead, ...rest].filter(Boolean) as VenueOccupant[]} cap={cap} fill={fill} />}
            {mode === 'huddle' && <HuddleStage people={[lead, ...rest].filter(Boolean) as VenueOccupant[]} cap={cap} />}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 px-4 py-2 text-[11px] text-white/50">
        <span className="flex items-center gap-1">
          {room.audio_mode === 'listen_only' ? (
            <MicOff size={11} aria-hidden="true" />
          ) : (
            <Radio size={11} aria-hidden="true" />
          )}
          {VENUE_AUDIO_MODE_LABELS[room.audio_mode] || room.audio_mode}
        </span>
        {/* Says what is actually true right now. A camera button that silently
            does nothing is the failure this replaces — if somebody cannot speak,
            the room should say so, and say which rule did it. */}
        <span className="flex items-center gap-1">
          <ScreenShare size={11} aria-hidden="true" />
          {!isVenueVideoConfigured() ? (
            <Trans>Video is not switched on for this venue yet</Trans>
          ) : error ? (
            // venue_room_grant()'s own message — "this room is closed", "not a
            // member of this venue". None of it reveals anything the member
            // could not already read off the map.
            <span className="text-amber-300/80">{error.message}</span>
          ) : !connected ? (
            <Trans>Connecting…</Trans>
          ) : grant?.can_publish ? (
            <Trans>Voice and screen sharing are on</Trans>
          ) : (
            <Trans>You are listening. A host can give you the floor.</Trans>
          )}
        </span>
      </div>
    </div>
  )
}

/**
 * The host's record button.
 *
 * Only rendered for a host, and the endpoint checks that again — hiding a button
 * is a suggestion, not a rule. Stopping is as prominent as starting on purpose:
 * a recording nobody can find the off switch for is how a hackathon ends up with
 * six hours of an empty room.
 */
function RecordButton({
  recording,
  busy,
  error,
  onStart,
  onStop,
}: {
  recording: boolean
  busy: boolean
  error: Error | null
  onStart: () => void
  onStop: () => void
}) {
  const { t } = useLingui()

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={recording ? onStop : onStart}
        disabled={busy}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-micro font-semibold transition-colors disabled:opacity-50',
          recording
            ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
            : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
        )}
      >
        <span
          className={cn('h-2 w-2 rounded-full', recording ? 'bg-red-400' : 'bg-white/40')}
          aria-hidden="true"
        />
        {busy ? t`Working…` : recording ? t`Stop recording` : t`Record this room`}
      </button>
      {/* The server's message, not a generic failure — "Recording storage is not
          configured" and "no participants in room" send you to different places. */}
      {error && <span className="text-micro text-amber-300/80">{error.message}</span>}
    </div>
  )
}

/** One person large, the rest along the bottom. A talk. */
function SpotlightStage({
  lead,
  rest,
  presenter,
  cap,
  fill,
}: {
  lead: VenueOccupant | null
  rest: VenueOccupant[]
  presenter?: { userId: string; name: string } | null
  cap: number
  fill?: boolean
}) {
  const { t } = useLingui()
  return (
    <>
      <Frame
        className={cn(fill ? 'min-h-[12rem] flex-1' : 'aspect-video w-full')}
        person={lead}
        size={72}
        label={presenter?.name || lead?.display_name || t`Nobody on camera yet`}
      />
      {rest.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {rest.slice(0, cap).map((person) => (
            <Frame key={person.user_id} className="aspect-video" person={person} size={28} />
          ))}
        </div>
      )}
    </>
  )
}

/** Equal tiles. Nobody is the main one, which is the point in a judging room. */
function GridStage({ people, cap, fill }: { people: VenueOccupant[]; cap: number; fill?: boolean }) {
  // An empty room still shows a shape, so the host can see what they chose.
  const tiles = people.slice(0, cap)
  const blanks = Math.max(0, Math.min(cap, 4) - tiles.length)

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', fill && 'min-h-0 flex-1 content-start')}>
      {tiles.map((person) => (
        <Frame key={person.user_id} className="aspect-video" person={person} size={34} />
      ))}
      {Array.from({ length: blanks }, (_, i) => (
        <Frame key={`blank-${i}`} className="aspect-video" person={null} size={34} />
      ))}
    </div>
  )
}

/** A row of small bubbles. People who are working, not watching. */
function HuddleStage({ people, cap }: { people: VenueOccupant[]; cap: number }) {
  const { t } = useLingui()
  const shown = people.slice(0, cap)
  const more = Math.max(0, people.length - shown.length)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.length === 0 && (
        <span className="px-1 py-2 text-xs text-white/50"><Trans>Nobody is in here yet.</Trans></span>
      )}
      {shown.map((person) => (
        <span
          key={person.user_id}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-white/20 bg-white/5 py-1 pl-1 pr-2.5"
          title={person.display_name || t`Member`}
        >
          <DiamondAvatar src={person.avatar_url} name={person.display_name || t`Member`} size={26} />
          <span className="max-w-[7rem] truncate text-xs text-white/80">
            {person.display_name || t`Member`}
          </span>
          <VideoOff size={11} className="shrink-0 text-white/30" aria-hidden="true" />
        </span>
      ))}
      {more > 0 && <span className="font-mono text-xs text-white/50">+{more}</span>}
    </div>
  )
}

/**
 * One camera tile.
 *
 * Dashed while there is no track, with the person's avatar behind it — the same
 * box a real video fills, so nothing shifts on the day it does.
 */
function Frame({
  person,
  size,
  label,
  className,
}: {
  person: VenueOccupant | null
  size: number
  label?: string
  className?: string
}) {
  const { t } = useLingui()
  const name = label || person?.display_name || t`Camera off`

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.04]',
        className
      )}
    >
      {person ? (
        <DiamondAvatar src={person.avatar_url} name={person.display_name || t`Member`} size={size} />
      ) : (
        <VideoOff size={Math.max(16, size / 2)} className="text-white/25" aria-hidden="true" />
      )}
      <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/80">
        {name}
      </span>
    </div>
  )
}
