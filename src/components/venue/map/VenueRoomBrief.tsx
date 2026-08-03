import { DoorOpen, Lock, Mic, MicOff, Radio, Users, X } from 'lucide-react'
import { colorForRoom, contrastInk } from '../../../lib/venue-map'
import { venueRoomIcon } from '../../../lib/category-icons'
import { VENUE_ROLE_LABELS, VENUE_ROOM_KIND_LABELS } from '../../../lib/constants'
import { DiamondAvatar } from '../../ui/DiamondAvatar'
import type { VenueOccupant, VenueRoom } from '../../../types'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

interface VenueRoomBriefProps {
  room: VenueRoom
  /** Live headcount for this room. */
  here: number
  occupants: VenueOccupant[]
  canEnter: boolean
  /**
   * Standing in the room's walls, or merely pointing at it. Only the wording of
   * the header changes: the questions are the same either way, and so is the
   * way in.
   */
  mode?: 'standing' | 'preview'
  /** Given while previewing: a way to put the card away without walking. */
  onDismiss?: () => void
  onEnter: () => void
}

const AUDIO_COPY: Record<string, { label: MessageDescriptor; icon: typeof Mic }> = {
  open: { label: msg`Anyone can speak`, icon: Mic },
  moderated: { label: msg`Hosts grant the mic`, icon: Radio },
  listen_only: { label: msg`Listen only — no mics`, icon: MicOff },
}

/**
 * What you are standing in front of.
 *
 * Shown while a member is inside a room's walls but has not entered it, and
 * while they are pointing at one from the map or the rail. Its whole job is to
 * answer the questions asked in a doorway — who is in there, is there space,
 * am I allowed, and will I be able to talk — before the decision rather than
 * after it.
 */
export function VenueRoomBrief({
  room,
  here,
  occupants,
  canEnter,
  mode = 'standing',
  onDismiss,
  onEnter,
}: VenueRoomBriefProps) {
  const { t, i18n } = useLingui()
  const color = colorForRoom(room)
  const KindIcon = venueRoomIcon(room.kind)
  const audio = AUDIO_COPY[room.audio_mode] || AUDIO_COPY.open
  const AudioIcon = audio.icon
  const full = room.capacity != null && here >= room.capacity
  const roles = room.allowed_roles || []

  return (
    <div className="overflow-hidden rounded-2xl border border-ktip-sand-200 bg-ktip-cream shadow-card">
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: color, color: contrastInk(color) }}
      >
        <KindIcon size={14} aria-hidden="true" />
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {mode === 'preview' ? t`A look inside` : t`You are at`}
        </span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider opacity-80">
          {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
          >
            <X size={13} aria-hidden="true" />
            <span className="sr-only">
              <Trans>Stop looking at {room.name}</Trans>
            </span>
          </button>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-display text-base font-bold text-ktip-sand-900">{room.name}</h3>
        {room.description && (
          <p className="mt-1 text-xs leading-relaxed text-ktip-sand-600">{room.description}</p>
        )}

        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-ktip-sand-700">
            <Users size={13} className="shrink-0 text-ktip-sand-400" aria-hidden="true" />
            <dt className="sr-only"><Trans>People here</Trans></dt>
            <dd>
              <Plural value={here} one="# person inside" other="# people inside" />
              {room.capacity != null && (
                <span className="text-ktip-sand-500">
                  {' '}
                  · <Trans>room for {room.capacity}</Trans>
                </span>
              )}
            </dd>
          </div>

          <div className="flex items-center gap-2 text-ktip-sand-700">
            <AudioIcon size={13} className="shrink-0 text-ktip-sand-400" aria-hidden="true" />
            <dt className="sr-only"><Trans>Audio</Trans></dt>
            <dd>{i18n._(audio.label)}</dd>
          </div>

          {roles.length > 0 && (
            <div className="flex items-center gap-2 text-ktip-sand-700">
              <Lock size={13} className="shrink-0 text-ktip-sand-400" aria-hidden="true" />
              <dt className="sr-only"><Trans>Who can enter</Trans></dt>
              <dd>
                <Trans>{roles.map((r) => VENUE_ROLE_LABELS[r] || r).join(', ')} only</Trans>
              </dd>
            </div>
          )}

          {room.recording_enabled && (
            <div className="flex items-center gap-2 font-medium text-ktip-sun-800">
              <Radio size={13} className="shrink-0" aria-hidden="true" />
              <dt className="sr-only"><Trans>Recording</Trans></dt>
              <dd><Trans>This room is recorded</Trans></dd>
            </div>
          )}
        </dl>

        {occupants.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {occupants.slice(0, 6).map((o) => (
              <DiamondAvatar
                key={o.user_id}
                src={o.avatar_url}
                name={o.display_name || t`Member`}
                size={26}
                title={o.display_name || t`Member`}
              />
            ))}
            {occupants.length > 6 && (
              <span className="font-mono text-[10px] text-ktip-sand-500">
                +{occupants.length - 6}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onEnter}
          disabled={!canEnter || full}
          style={canEnter && !full ? { background: color, color: contrastInk(color) } : undefined}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:bg-ktip-sand-100 disabled:text-ktip-sand-500"
        >
          <DoorOpen size={15} aria-hidden="true" />
          {!room.is_open
            ? t`Closed right now`
            : !canEnter
              ? t`Not open to your role`
              : full
                ? t`Full`
                : t`Enter ${room.name}`}
        </button>
      </div>
    </div>
  )
}
