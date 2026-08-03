import { Lock, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  VENUE_ROOM_KIND_COLORS,
  VENUE_ROOM_KIND_ICONS,
  VENUE_ROOM_KIND_LABELS,
} from '../../lib/constants'
import { resolveIcon } from '../../lib/icon-map'
import { AvatarCluster } from './AvatarCluster'
import type { VenueOccupant, VenueRoom } from '../../types'
import { Trans, useLingui } from '@lingui/react/macro'

interface RoomZoneProps {
  room: VenueRoom
  occupants: VenueOccupant[]
  overflow: number
  total: number
  isCurrent?: boolean
  onEnter: (room: VenueRoom) => void
  className?: string
  /** Compact rendering for overlay chips on a floorplan SVG. */
  variant?: 'card' | 'chip'
}

/**
 * One room, as either a card in the fallback grid or a chip pinned over a
 * floorplan SVG. Both render the same three facts: what the room is for, who is
 * in it, and whether it is open.
 */
export function RoomZone({
  room,
  occupants,
  overflow,
  total,
  isCurrent,
  onEnter,
  className,
  variant = 'card',
}: RoomZoneProps) {
  const { t } = useLingui()
  const Icon = resolveIcon(VENUE_ROOM_KIND_ICONS[room.kind])
  const kindLabel = VENUE_ROOM_KIND_LABELS[room.kind] || room.kind
  const closed = !room.is_open
  const full = room.capacity != null && total >= room.capacity

  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={() => onEnter(room)}
        disabled={closed}
        aria-label={closed ? t`${room.name} — ${total} here, closed` : t`${room.name} — ${total} here`}
        className={cn(
          'group flex max-w-[14rem] flex-col gap-1 rounded-xl border bg-ktip-cream/95 px-2.5 py-1.5 text-left shadow-medium backdrop-blur-sm transition-all',
          closed ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:shadow-hard',
          isCurrent ? 'border-ktip-ocean-500 ring-2 ring-ktip-ocean-300' : 'border-ktip-sand-200',
          className
        )}
      >
        <span className="flex items-center gap-1.5">
          <Icon size={14} className="shrink-0 text-ktip-ocean-600" aria-hidden="true" />
          <span className="truncate text-xs font-semibold text-ktip-sand-900">{room.name}</span>
          {closed && <Lock size={11} className="shrink-0 text-ktip-sand-500" aria-hidden="true" />}
        </span>
        <span className="flex items-center gap-2">
          {total > 0 ? (
            <AvatarCluster occupants={occupants} overflow={overflow} size="sm" />
          ) : (
            <span className="text-[10px] text-ktip-sand-500"><Trans>Empty</Trans></span>
          )}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onEnter(room)}
      disabled={closed}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border bg-ktip-cream p-4 text-left shadow-card transition-all',
        closed
          ? 'cursor-not-allowed opacity-60'
          : 'hover:-translate-y-0.5 hover:shadow-card-hover',
        isCurrent ? 'border-ktip-ocean-500 ring-2 ring-ktip-ocean-200' : 'border-ktip-sand-100',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ktip-ocean-50 text-ktip-ocean-700">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-ktip-sand-900">
              {room.name}
            </p>
            <span
              className={cn(
                'mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                VENUE_ROOM_KIND_COLORS[room.kind] ||
                  'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200'
              )}
            >
              {kindLabel}
            </span>
          </div>
        </div>

        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ktip-sand-600">
          <Users size={13} aria-hidden="true" />
          {total}
          {room.capacity != null && <span className="text-ktip-sand-400">/{room.capacity}</span>}
        </span>
      </div>

      {room.description && (
        <p className="line-clamp-2 text-sm text-ktip-sand-600">{room.description}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        {total > 0 ? (
          <AvatarCluster occupants={occupants} overflow={overflow} size="md" />
        ) : (
          <span className="text-xs text-ktip-sand-500"><Trans>Nobody here yet</Trans></span>
        )}

        {closed ? (
          <span className="flex items-center gap-1 text-xs font-medium text-ktip-sand-500">
            <Lock size={12} aria-hidden="true" /> <Trans>Closed</Trans>
          </span>
        ) : full ? (
          <span className="text-xs font-medium text-ktip-sun-800"><Trans>At capacity</Trans></span>
        ) : (
          <span className="text-xs font-semibold text-ktip-ocean-600 group-hover:underline">
            <Trans>Enter →</Trans>
          </span>
        )}
      </div>
    </button>
  )
}
