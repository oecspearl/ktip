import { useState } from 'react'
import {
  Info,
  Lock,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { useVenueRoomMutations, useVenueRooms } from '../../../hooks/useVenueRooms'
import { useVenueRoster, useVenueRosterAdmin } from '../../../hooks/useVenue'
import { useUpdateEvent } from '../../../hooks/useEvents'
import { mapConfigOf, useSaveVenueMap } from '../../../hooks/useVenueMap'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { VenueMapEditor } from '../../../components/venue/map/VenueMapEditor'
import {
  VENUE_AVAILABILITY_LABELS,
  VENUE_ROLE_LABELS,
  VENUE_ROOM_KIND_LABELS,
} from '../../../lib/constants'
import { formatRelativeTime } from '../../../lib/utils'
import type { Event, VenueAudioMode, VenueRole, VenueRoom, VenueRoomKind } from '../../../types'

interface AdminEventVenueTabProps {
  eventId: string
  /** events.event_type — filters the map editor's panel picker per type. */
  eventType?: string | null
  hasVenue: boolean
  venueFloorplanUrl: string | null
  /** The drawn map's grid and floor list (089). Null until one is drawn. */
  venueMap: Event['venue_map']
  /** Re-reads the event so the toggles reflect what was saved. */
  onEventChange: () => void
}

const ROOM_KINDS: VenueRoomKind[] = [
  'main_hall',
  'networking',
  'workshop',
  'help_desk',
  'sponsor_booth',
  'judging',
  'stage',
  'breakout',
]

const AUDIO_MODES: { value: VenueAudioMode; label: string }[] = [
  { value: 'open', label: 'Open — everyone can speak' },
  { value: 'moderated', label: 'Moderated — hosts grant the mic' },
  { value: 'listen_only', label: 'Listen only' },
]

const VENUE_ROLES: VenueRole[] = [
  'participant',
  'mentor',
  'judge',
  'organizer',
  'spectator',
  'speaker',
]

/** Slug from a room name, so a host never has to think about the key column. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

/**
 * Venue setup for one event.
 *
 * Deliberately a list with a text field for `svg_zone_id`, not a visual
 * zone-mapping tool. The host authors the floorplan in a real drawing tool and
 * pastes in the element ids; a bespoke editor is a week of work for something
 * done once per event. Any room whose id does not match the uploaded SVG still
 * appears on the venue page under "Not on the map", which is how a typo gets
 * noticed.
 */
export default function AdminEventVenueTab({
  eventId,
  eventType,
  hasVenue,
  venueFloorplanUrl,
  venueMap,
  onEventChange,
}: AdminEventVenueTabProps) {
  const toast = useToast()
  const { rooms, loading } = useVenueRooms(eventId)
  const { createRoom, updateRoom, deleteRoom, seedDefaults, loading: saving } =
    useVenueRoomMutations()
  const { roster } = useVenueRoster(eventId)
  const { setRole, removeMember } = useVenueRosterAdmin()
  const { updateEvent } = useUpdateEvent()
  const { saveMap, saving: savingMap } = useSaveVenueMap()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VenueRoom | null>(null)
  const [floorplan, setFloorplan] = useState(venueFloorplanUrl || '')

  const [name, setName] = useState('')
  const [kind, setKind] = useState<VenueRoomKind>('breakout')
  const [description, setDescription] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [capacity, setCapacity] = useState('')
  const [audioMode, setAudioMode] = useState<VenueAudioMode>('open')

  const resetForm = () => {
    setName('')
    setKind('breakout')
    setDescription('')
    setZoneId('')
    setCapacity('')
    setAudioMode('open')
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (room: VenueRoom) => {
    setEditingId(room.id)
    setName(room.name)
    setKind(room.kind)
    setDescription(room.description || '')
    setZoneId(room.svg_zone_id || '')
    setCapacity(room.capacity != null ? String(room.capacity) : '')
    setAudioMode(room.audio_mode)
    setShowForm(true)
  }

  const submitRoom = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('A room needs a name')
      return
    }

    const payload = {
      name: trimmed,
      kind,
      description: description.trim() || null,
      svg_zone_id: zoneId.trim() || null,
      capacity: capacity ? Number(capacity) : null,
      audio_mode: audioMode,
    }

    try {
      if (editingId) {
        await updateRoom({ roomId: editingId, eventId, updates: payload })
        toast.success('Room updated')
      } else {
        await createRoom({ event_id: eventId, key: slugify(trimmed), ...payload } as any)
        toast.success('Room created')
      }
      resetForm()
    } catch (err: any) {
      toast.error(err?.message || 'Could not save that room')
    }
  }

  const toggleVenue = async () => {
    try {
      await updateEvent(eventId, { has_venue: !hasVenue } as any)
      onEventChange()
      toast.success(hasVenue ? 'Venue turned off' : 'Venue turned on')
    } catch (err: any) {
      toast.error(err?.message || 'Could not update the event')
    }
  }

  const saveFloorplan = async () => {
    try {
      await updateEvent(eventId, { venue_floorplan_url: floorplan.trim() || null } as any)
      onEventChange()
      toast.success('Floorplan saved')
    } catch (err: any) {
      toast.error(err?.message || 'Could not save the floorplan')
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- the switch ---- */}
      <section className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-ktip-sand-900">Virtual venue</h2>
            <p className="mt-1 text-sm text-ktip-sand-600">
              {hasVenue
                ? 'Registered attendees can enter the venue and see each other.'
                : 'Off. Attendees see the normal event page only.'}
            </p>
          </div>
          <Button variant={hasVenue ? 'secondary' : 'primary'} size="sm" onClick={toggleVenue}>
            {hasVenue ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
      </section>

      {/* ---- the drawn map ----
          The primary way to build a venue. The SVG upload below still works and
          is left in place for a host who already has a hand-drawn plan. */}
      <section>
        <div className="mb-2">
          <h2 className="font-display text-base font-bold text-ktip-sand-900">The map</h2>
          <p className="mt-1 text-sm text-ktip-sand-600">
            Draw the building. Pick a ready-made room, drop it on the grid, then set its rules —
            attendees walk this exact map, so what you draw is what they see.
          </p>
        </div>
        <VenueMapEditor
          rooms={rooms}
          config={mapConfigOf({ venue_map: venueMap })}
          saving={savingMap}
          eventType={eventType}
          draftKey={eventId}
          onSave={async (config, payload) => {
            try {
              await saveMap({ eventId, map: config, rooms: payload })
              onEventChange()
              toast.success('Map saved')
            } catch (err: any) {
              toast.error(err?.message || 'Could not save the map')
              throw err
            }
          }}
        />
      </section>

      {/* ---- floorplan ---- */}
      <section className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-4">
        <h2 className="font-display text-base font-bold text-ktip-sand-900">
          Uploaded floorplan (optional)
        </h2>
        <p className="mt-1 text-sm text-ktip-sand-600">
          A URL to an SVG in the <code className="text-xs">event-assets</code> bucket. Give each
          room shape an <code className="text-xs">id</code>, then paste that id into the room's
          zone field below.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={floorplan}
            onChange={(e) => setFloorplan(e.target.value)}
            placeholder="https://…/floorplan.svg"
            className="min-w-0 flex-1 rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm focus:border-ktip-ocean-400 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-200"
          />
          <Button size="sm" icon={<Save size={14} />} onClick={saveFloorplan}>
            Save
          </Button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ktip-sand-500">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          Only used when no room has been placed on the drawn map above. With neither, the venue
          renders the rooms as a grid of cards — occupancy, avatars and entry all behave the same.
        </p>
      </section>

      {/* ---- rooms ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ktip-sand-900">
            Rooms {rooms ? `(${rooms.length})` : ''}
          </h2>
          <div className="flex gap-2">
            {(!rooms || rooms.length === 0) && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Sparkles size={14} />}
                loading={saving}
                onClick={async () => {
                  try {
                    await seedDefaults(eventId)
                    toast.success('Starter rooms created')
                  } catch (err: any) {
                    toast.error(err?.message || 'Could not create the starter rooms')
                  }
                }}
              >
                Create starter rooms
              </Button>
            )}
            <Button
              size="sm"
              icon={showForm ? <X size={14} /> : <Plus size={14} />}
              onClick={() => (showForm ? resetForm() : setShowForm(true))}
            >
              {showForm ? 'Cancel' : 'Add room'}
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="mb-4 grid gap-3 rounded-2xl border border-ktip-ocean-200 bg-ktip-ocean-50 p-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-ktip-sand-700">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
                placeholder="Networking Area"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-ktip-sand-700">Purpose</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as VenueRoomKind)}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
              >
                {ROOM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {VENUE_ROOM_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-ktip-sand-700">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
                placeholder="What happens in this room?"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-ktip-sand-700">
                Floorplan zone id
              </span>
              <input
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm font-mono text-xs"
                placeholder="zone-networking"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-ktip-sand-700">Capacity</span>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
                placeholder="No limit"
              />
            </label>

            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-ktip-sand-700">Audio</span>
              <select
                value={audioMode}
                onChange={(e) => setAudioMode(e.target.value as VenueAudioMode)}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
              >
                {AUDIO_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm:col-span-2">
              <Button size="sm" loading={saving} icon={<Save size={14} />} onClick={submitRoom}>
                {editingId ? 'Save room' : 'Create room'}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-32 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        ) : !rooms || rooms.length === 0 ? (
          <p className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-6 text-center text-sm text-ktip-sand-500">
            No rooms yet. The starter set gives you a Main Hall, a networking area, a workshop room,
            a help desk, a showcase stage and a quiet room.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-ktip-sand-200 text-xs uppercase tracking-wider text-ktip-sand-500">
                  <th scope="col" className="px-4 py-3 text-left">Room</th>
                  <th scope="col" className="px-4 py-3 text-left">Purpose</th>
                  <th scope="col" className="px-4 py-3 text-left">Zone id</th>
                  <th scope="col" className="px-4 py-3 text-left">Capacity</th>
                  <th scope="col" className="px-4 py-3 text-left">Audio</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} className="border-b border-ktip-sand-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ktip-sand-900">{room.name}</p>
                      <p className="font-mono text-xs text-ktip-sand-400">{room.key}</p>
                    </td>
                    <td className="px-4 py-3 text-ktip-sand-600">
                      {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ktip-sand-500">
                      {room.svg_zone_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-ktip-sand-600">{room.capacity ?? 'No limit'}</td>
                    <td className="px-4 py-3 text-ktip-sand-600">{room.audio_mode}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateRoom({
                              roomId: room.id,
                              eventId,
                              updates: { is_open: !room.is_open },
                            })
                          }
                          aria-label={room.is_open ? `Close ${room.name}` : `Open ${room.name}`}
                          title={room.is_open ? 'Close room' : 'Open room'}
                          className="rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-ktip-ocean-600"
                        >
                          {room.is_open ? <Unlock size={15} /> : <Lock size={15} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(room)}
                          aria-label={`Edit ${room.name}`}
                          title="Edit"
                          className="rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-ktip-ocean-600"
                        >
                          <Save size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(room)}
                          aria-label={`Delete ${room.name}`}
                          title="Delete"
                          className="rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- roster ---- */}
      <section>
        <h2 className="mb-3 font-display text-base font-bold text-ktip-sand-900">
          Who has entered {roster ? `(${roster.length})` : ''}
        </h2>
        {!roster || roster.length === 0 ? (
          <p className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-6 text-center text-sm text-ktip-sand-500">
            Nobody has entered the venue yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-ktip-sand-200 text-xs uppercase tracking-wider text-ktip-sand-500">
                  <th scope="col" className="px-4 py-3 text-left">Member</th>
                  <th scope="col" className="px-4 py-3 text-left">Role</th>
                  <th scope="col" className="px-4 py-3 text-left">Status</th>
                  <th scope="col" className="px-4 py-3 text-left">Last seen</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((m) => (
                  <tr key={m.id} className="border-b border-ktip-sand-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-ktip-sand-900">
                      {m.user?.display_name || m.user_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={m.role}
                        onChange={(e) =>
                          setRole({ memberId: m.id, eventId, role: e.target.value as VenueRole })
                        }
                        aria-label={`Role for ${m.user?.display_name || 'member'}`}
                        className="rounded-lg border border-ktip-sand-200 px-2 py-1 text-xs"
                      >
                        {VENUE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {VENUE_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-ktip-sand-600">
                      {VENUE_AVAILABILITY_LABELS[m.availability] || m.availability}
                    </td>
                    <td className="px-4 py-3 text-ktip-sand-500">
                      {formatRelativeTime(m.last_seen_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => removeMember({ memberId: m.id, eventId })}
                        aria-label={`Remove ${m.user?.display_name || 'member'} from the venue`}
                        title="Remove from venue"
                        className="rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmModal
        open={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteRoom({ roomId: deleteTarget.id, eventId })
            toast.success('Room deleted')
          } catch (err: any) {
            toast.error(err?.message || 'Could not delete that room')
          }
          setDeleteTarget(null)
        }}
        title="Delete this room?"
        message={`"${deleteTarget?.name}" and its chat history will be removed. This cannot be undone.`}
        confirmLabel="Delete room"
        confirmVariant="danger"
      />
    </div>
  )
}
