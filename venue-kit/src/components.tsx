import { useEffect, useState, type ReactNode } from 'react'
import type { VenueAvailability, VenueOccupant, VenueRoom } from './types'

/**
 * Minimal, dependency-free components. Every element carries a `vk-` class;
 * venue-kit.css provides a neutral default look driven by CSS variables.
 * Replace freely — all state lives in the provider, none in here.
 */

export const AVAILABILITY_LABELS: Record<VenueAvailability, string> = {
  working: 'Working',
  away: 'Away',
  busy: 'Do not disturb',
  help_wanted: 'Needs help',
  offline: 'Offline',
}

/** Colour never carries the meaning alone — every dot ships a text label. */
export function AvailabilityDot({ availability }: { availability: VenueAvailability }) {
  return (
    <span className="vk-dot-wrap">
      <span className={`vk-dot vk-dot--${availability}`} aria-hidden="true" />
      <span className="vk-dot-label">{AVAILABILITY_LABELS[availability]}</span>
    </span>
  )
}

/**
 * Connection truth, with a grace window. A fresh join takes a moment and
 * sub-2s blips are routine — announcing "Reconnecting" for those is noise.
 * The chip renders nothing during the grace window and only alarms when the
 * outage is real. Never render a confident zero from a dead socket.
 */
export function ConnectionChip({
  connected,
  headcount,
  graceMs = 2000,
}: {
  connected: boolean
  headcount: number
  graceMs?: number
}) {
  const [outage, setOutage] = useState(false)
  useEffect(() => {
    if (connected) {
      setOutage(false)
      return
    }
    const tid = window.setTimeout(() => setOutage(true), graceMs)
    return () => window.clearTimeout(tid)
  }, [connected, graceMs])

  if (!connected && !outage) return null
  return (
    <span
      className={`vk-chip ${connected ? 'vk-chip--live' : 'vk-chip--stale'}`}
      title={connected ? 'Live presence connected' : 'Reconnecting — counts may be stale'}
    >
      <span className="vk-chip-dot" aria-hidden="true" />
      {connected ? `${headcount} here` : 'Reconnecting'}
    </span>
  )
}

const PICKER_CHOICES: Exclude<VenueAvailability, 'offline'>[] = [
  'working',
  'busy',
  'help_wanted',
  'away',
]

export function AvailabilityPicker({
  value,
  onChange,
}: {
  value: VenueAvailability
  onChange: (next: Exclude<VenueAvailability, 'offline'>) => void
}) {
  return (
    <div className="vk-picker" role="group" aria-label="Your availability">
      {PICKER_CHOICES.map((choice) => (
        <button
          key={choice}
          type="button"
          className={`vk-picker-btn ${value === choice ? 'vk-picker-btn--active' : ''}`}
          aria-pressed={value === choice}
          onClick={() => onChange(choice)}
        >
          <span className={`vk-dot vk-dot--${choice}`} aria-hidden="true" />
          {AVAILABILITY_LABELS[choice]}
        </button>
      ))}
    </div>
  )
}

/**
 * Everyone in a list, needs-help first (the sort comes from presence-logic —
 * pass occupants through occupantsInRoom / occupantsUnassigned / sortOccupants).
 */
export function OccupantList({
  occupants,
  title = 'In this room',
  emptyLabel = 'Nobody here yet.',
  renderActions,
}: {
  occupants: VenueOccupant[]
  title?: string
  emptyLabel?: string
  /** Per-person trailing actions (profile button, DM button…). */
  renderActions?: (occupant: VenueOccupant) => ReactNode
}) {
  return (
    <div className="vk-panel">
      <div className="vk-panel-head">
        <h2 className="vk-panel-title">{title}</h2>
        <span className="vk-panel-count">{occupants.length}</span>
      </div>
      {occupants.length === 0 ? (
        <p className="vk-empty">{emptyLabel}</p>
      ) : (
        <ul className="vk-list">
          {occupants.map((o) => (
            <li key={o.user_id} className="vk-row">
              <Avatar name={o.display_name} src={o.avatar_url} />
              <span className="vk-row-main">
                <span className="vk-row-name">
                  {o.display_name || 'Member'}
                  {o.role !== 'participant' && <em className="vk-role">{o.role}</em>}
                </span>
                <AvailabilityDot availability={o.availability} />
                {o.status_note && <span className="vk-note">“{o.status_note}”</span>}
              </span>
              {renderActions?.(o)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Room cards with live occupancy. Occupancy counts people reachable NOW. */
export function RoomGrid({
  rooms,
  occupancy,
  onEnter,
}: {
  rooms: VenueRoom[]
  occupancy: Record<string, number>
  onEnter: (room: VenueRoom) => void
}) {
  return (
    <div className="vk-grid">
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          className="vk-room"
          disabled={!room.is_open}
          onClick={() => onEnter(room)}
        >
          <span className="vk-room-kind">{room.kind.replace(/_/g, ' ')}</span>
          <span className="vk-room-name">{room.name}</span>
          {room.description && <span className="vk-room-desc">{room.description}</span>}
          <span className="vk-room-meta">
            {occupancy[room.id] || 0} here
            {!room.is_open && ' · closed'}
            {room.audio_mode === 'listen_only' && ' · listen only'}
            {room.audio_mode === 'moderated' && ' · moderated'}
          </span>
        </button>
      ))}
    </div>
  )
}

function Avatar({ name, src }: { name: string | null; src: string | null }) {
  if (src) return <img className="vk-avatar" src={src} alt="" />
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <span className="vk-avatar vk-avatar--fallback" aria-hidden="true">
      {initial}
    </span>
  )
}
