import { MicOff, Radio, ScreenShare, Video, VideoOff } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { VENUE_AUDIO_MODE_LABELS } from '../../../lib/constants'
import { ROOM_CAMERA_LABELS, type RoomCameraMode } from '../../../lib/venue-room-layout'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import type { VenueOccupant, VenueRoom } from '../../../types'

/**
 * Where the call goes.
 *
 * Still a placeholder — phase 2 puts LiveKit inside these frames, see
 * docs/VIDEO-SETUP.md — but a placeholder with the *shape of the call it will
 * be*. A judging panel is nine equal tiles, a keynote is one big frame with
 * thumbnails, a team room is a row of small bubbles, and a quiet breakout has
 * no call at all. Drawing all four as the same grey box taught the host
 * nothing and made every room look identical before anyone spoke.
 *
 * The tiles are seeded from the people actually in the room, so what is drawn
 * is "these people, cameras off" rather than furniture. Each one is sized so a
 * <VideoTrack> replaces it without the layout moving.
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
  if (mode === 'off') return null

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
          {presenter ? `${presenter.name} is presenting` : ROOM_CAMERA_LABELS[mode]}
        </span>
        {room.recording_enabled && (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden="true" />
            Recording
          </span>
        )}
      </div>

      <div className={cn('p-3', fill && 'flex min-h-0 flex-1 flex-col')}>
        {mode === 'spotlight' && (
          <SpotlightStage lead={lead} rest={rest} presenter={presenter} cap={cap} fill={fill} />
        )}
        {mode === 'grid' && <GridStage people={[lead, ...rest].filter(Boolean) as VenueOccupant[]} cap={cap} fill={fill} />}
        {mode === 'huddle' && <HuddleStage people={[lead, ...rest].filter(Boolean) as VenueOccupant[]} cap={cap} />}
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
        <span className="flex items-center gap-1">
          <ScreenShare size={11} aria-hidden="true" />
          Voice and screen sharing arrive with the next release
        </span>
      </div>
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
  return (
    <>
      <Frame
        className={cn(fill ? 'min-h-[12rem] flex-1' : 'aspect-video w-full')}
        person={lead}
        size={72}
        label={presenter?.name || lead?.display_name || 'Nobody on camera yet'}
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
  const shown = people.slice(0, cap)
  const more = Math.max(0, people.length - shown.length)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.length === 0 && (
        <span className="px-1 py-2 text-xs text-white/50">Nobody is in here yet.</span>
      )}
      {shown.map((person) => (
        <span
          key={person.user_id}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-white/20 bg-white/5 py-1 pl-1 pr-2.5"
          title={person.display_name || 'Member'}
        >
          <DiamondAvatar src={person.avatar_url} name={person.display_name || 'Member'} size={26} />
          <span className="max-w-[7rem] truncate text-xs text-white/80">
            {person.display_name || 'Member'}
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
  const name = label || person?.display_name || 'Camera off'

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.04]',
        className
      )}
    >
      {person ? (
        <DiamondAvatar src={person.avatar_url} name={person.display_name || 'Member'} size={size} />
      ) : (
        <VideoOff size={Math.max(16, size / 2)} className="text-white/25" aria-hidden="true" />
      )}
      <span className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/80">
        {name}
      </span>
    </div>
  )
}
