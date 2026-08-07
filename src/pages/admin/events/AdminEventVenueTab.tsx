import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  BookmarkPlus,
  ExternalLink,
  Globe,
  Info,
  Lock,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  UserPlus,
  X,
} from 'lucide-react'
import { useVenueRoomMutations, useVenueRooms } from '../../../hooks/useVenueRooms'
import {
  useVenueRoomRoleAdmin,
  useVenueRoomRoles,
  useVenueRoster,
  useVenueRosterAdmin,
} from '../../../hooks/useVenue'
// The same profile search the roles console uses. Nothing about it is
// role-specific — it is "find me a person by name".
import { useRoleMembers } from '../../../hooks/useRolePermissions'
import { useUpdateEvent } from '../../../hooks/useEvents'
import { mapConfigOf, useSaveVenueMap } from '../../../hooks/useVenueMap'
import { useSaveVenueTemplate, useVenueTemplates } from '../../../hooks/useVenueTemplates'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { VenueMapEditor } from '../../../components/venue/map/VenueMapEditor'
import { VENUE_ROLE_LABELS, VENUE_ROOM_KIND_LABELS } from '../../../lib/constants'
import type { Event, VenueAudioMode, VenueRole, VenueRoom, VenueRoomKind } from '../../../types'

interface AdminEventVenueTabProps {
  eventId: string
  /** Names the template a host saves off this venue. */
  eventTitle?: string
  /** events.event_type — filters the map editor's panel picker per type. */
  eventType?: string | null
  hasVenue: boolean
  /**
   * events.spectators_enabled. Existed since 070 with nothing ever setting it,
   * so join_venue()'s spectator branch was unreachable and every registrant
   * arrived as a participant. The switch below is what it was waiting for.
   */
  spectatorsEnabled?: boolean
  venueFloorplanUrl: string | null
  /** The drawn map's grid and floor list (089). Null until one is drawn. */
  venueMap: Event['venue_map']
  /** Where the host can walk the venue they just drew. */
  venueHref?: string
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
  eventTitle,
  eventType,
  hasVenue,
  spectatorsEnabled,
  venueFloorplanUrl,
  venueMap,
  venueHref,
  onEventChange,
}: AdminEventVenueTabProps) {
  const toast = useToast()
  const { rooms, loading } = useVenueRooms(eventId)
  const { createRoom, updateRoom, deleteRoom, seedDefaults, loading: saving } =
    useVenueRoomMutations()
  const { roster } = useVenueRoster(eventId)
  const { inviteMember, removeMember } = useVenueRosterAdmin()
  const { roomRoles } = useVenueRoomRoles(eventId)
  const { setRoomRole, clearRoomRole, applyEverywhere, scopeToRoom } = useVenueRoomRoleAdmin()
  const { updateEvent } = useUpdateEvent()
  const { saveMap, saving: savingMap } = useSaveVenueMap()
  const { templates } = useVenueTemplates()
  const { saveTemplate, saving: savingTemplate } = useSaveVenueTemplate()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VenueRoom | null>(null)
  const [floorplan, setFloorplan] = useState(venueFloorplanUrl || '')
  const [templateDialog, setTemplateDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')

  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteRole, setInviteRole] = useState<VenueRole>('judge')
  const [resultsOpen, setResultsOpen] = useState(false)
  // Which room the invite box is aiming at. Null means the whole venue.
  const [inviteRoomId, setInviteRoomId] = useState<string | null>(null)
  const inviteBoxRef = useRef<HTMLDivElement | null>(null)

  // Click anywhere outside the box and the results fold away. pointerdown
  // rather than click so the list is gone before whatever was clicked runs,
  // and so a drag that starts outside counts too.
  useEffect(() => {
    if (!resultsOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!inviteBoxRef.current?.contains(e.target as Node)) setResultsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [resultsOpen])
  // Two letters before searching: the hook has no debounce, and a one-letter
  // query is a scan of the whole member table for no useful result.
  const searching = inviteSearch.trim().length >= 2
  const { members } = useRoleMembers(searching ? inviteSearch.trim() : undefined)

  // Anyone already on the roster has a role and a row; offering to add them
  // again would just fail the unique constraint.
  const candidates = useMemo(() => {
    if (!searching) return []
    const seen = new Set((roster || []).map((m) => m.user_id))
    return (members || []).filter((p) => !seen.has(p.id)).slice(0, 6)
  }, [searching, members, roster])

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

  /**
   * The people picker, rendered under whichever room card opened it. A room
   * role rather than a venue-wide one is the only thing it can write — the
   * "Everywhere" button on a person is what widens it afterwards.
   */
  const renderRolePicker = (room: VenueRoom) => (
    <div
      ref={inviteBoxRef}
      className="mt-3 animate-tab-enter rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50 p-3"
    >
      <p className="mb-2 text-xs text-ktip-sand-600">
        The role applies in <strong className="font-semibold">{room.name}</strong> and nowhere
        else. They still have to register for the event.
      </p>

      <div className="mb-2 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={inviteSearch}
            onChange={(e) => {
              setInviteSearch(e.target.value)
              setResultsOpen(true)
            }}
            onFocus={() => setResultsOpen(true)}
            placeholder="Search people by name…"
            aria-label={`Search people to give a role in ${room.name}`}
            className="w-full rounded-lg border border-ktip-sand-200 py-2 pl-3 pr-9 text-sm focus:border-ktip-ocean-400 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-200"
          />
          {inviteSearch && (
            <button
              type="button"
              onClick={() => {
                setInviteSearch('')
                setResultsOpen(false)
              }}
              aria-label="Clear the search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-ktip-sand-700"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as VenueRole)}
          aria-label="Role to give"
          className="rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
        >
          {VENUE_ROLES.map((r) => (
            <option key={r} value={r}>
              {VENUE_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {!resultsOpen ? null : inviteSearch.trim().length < 2 ? (
        <p className="text-xs text-ktip-sand-500">Type at least two letters to search.</p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-ktip-sand-500">
          Nobody matches, or everyone who does already has a role here.
        </p>
      ) : (
        <ul className="divide-y divide-ktip-ocean-100 overflow-hidden rounded-xl border border-ktip-ocean-100 bg-ktip-cream">
          {candidates.map((person) => (
            <li key={person.id}>
              {/* The whole row is the control — a small Add button was a small
                  target for what is obviously "pick this person". */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    // A room role is not membership (the resolver refuses to
                    // treat it as such), so somebody who has never entered
                    // needs a roster row first or the role would mean nothing
                    // when they arrive. Already on the roster: the unique
                    // constraint refuses, and that refusal is the answer.
                    await inviteMember({
                      eventId,
                      userId: person.id,
                      role: 'participant',
                    }).catch(() => {})
                    await setRoomRole({
                      eventId,
                      roomId: room.id,
                      userId: person.id,
                      role: inviteRole,
                    })
                    toast.success(
                      `${person.display_name || 'They'} are ${VENUE_ROLE_LABELS[inviteRole].toLowerCase()} in ${room.name}`
                    )
                    setInviteSearch('')
                  } catch (err: any) {
                    toast.error(err?.message || 'Could not give them that role')
                  }
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-ktip-ocean-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ktip-sand-900">
                    {person.display_name || person.id.slice(0, 8)}
                  </span>
                  {person.organization && (
                    <span className="block truncate text-xs text-ktip-sand-500">
                      {person.organization}
                    </span>
                  )}
                </span>
                <span className="shrink-0 rounded-lg bg-ktip-ocean-600 px-2.5 py-1 text-xs font-semibold text-white">
                  Add
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

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
          <div className="flex gap-2">
            {hasVenue && venueHref && (
              <Link to={venueHref}>
                <Button variant="secondary" size="sm" icon={<ExternalLink size={14} />}>
                  Open the venue
                </Button>
              </Link>
            )}
            <Button variant={hasVenue ? 'secondary' : 'primary'} size="sm" onClick={toggleVenue}>
              {hasVenue ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        </div>

        {/* Only while there is a venue: "viewers watch the rooms" says nothing
            when there are no rooms to watch, and the same reasoning hides
            everything below this card. */}
        {hasVenue && (
          <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-ktip-sand-200 pt-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
              checked={!!spectatorsEnabled}
              onChange={async (e) => {
                const next = e.currentTarget.checked
                try {
                  await updateEvent(eventId, { spectators_enabled: next } as any)
                  onEventChange()
                  toast.success(next ? 'Viewers can now register' : 'Viewers turned off')
                } catch (err: any) {
                  toast.error(err?.message || 'Could not change who may watch')
                }
              }}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ktip-sand-800">
                Let people register as viewers
              </span>
              <span className="block text-xs text-ktip-sand-500">
                Viewers watch the rooms without joining a team or submitting, and do not take up a
                participant place. Off means everyone who registers is competing.
              </span>
            </span>
          </label>
        )}
      </section>

      {/* Everything below configures a venue attendees cannot reach while it is
          off. The rows stay in the database — turning it back on brings the map,
          the floorplan and the rooms back exactly as they were. */}
      {hasVenue && (
        <>
        {/* ---- the drawn map ----
            The primary way to build a venue. The SVG upload below still works and
            is left in place for a host who already has a hand-drawn plan. */}
        <section>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-ktip-sand-900">The map</h2>
              <p className="mt-1 text-sm text-ktip-sand-600">
                Draw the building. Pick a ready-made room, drop it on the grid, then set its rules —
                attendees walk this exact map, so what you draw is what they see.
              </p>
            </div>
            {/* Snapshot the drawn building for the host's next event. Only
                offered once there is something drawn AND saved — the RPC reads
                the rows, not the editor's draft. */}
            {(rooms?.length ?? 0) > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<BookmarkPlus size={14} />}
                onClick={() => {
                  setTemplateName(eventTitle || '')
                  setTemplateDescription('')
                  setTemplateDialog(true)
                }}
              >
                Save as template
              </Button>
            )}
          </div>
          <VenueMapEditor
            rooms={rooms}
            config={mapConfigOf({ venue_map: venueMap })}
            saving={savingMap}
            eventType={eventType}
            savedTemplates={templates}
            draftKey={eventId}
            // No success toast: the editor saves itself every couple of seconds
            // and says so in its own toolbar. A failure still has to be loud.
            onSave={async (config, payload) => {
              try {
                await saveMap({ eventId, map: config, rooms: payload })
                onEventChange()
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

        {/* ---- rooms and the people in them ----
            One section, because they are one question. A role is either held in
            a particular room — the list inside each card — or across the whole
            venue, which is the roster at the bottom. Splitting them into "rooms"
            and "who is here" made the per-room case impossible to express. */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-ktip-sand-900">
              Rooms and who is in them {rooms ? `(${rooms.length})` : ''}
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
              {/* No "add room" here: rooms come from the map. Drawing one is
                  what creates it, so a second way in would let a host make a
                  room that is nowhere in the building. The form below is still
                  reached by the edit button on a room. */}
              {showForm && (
                <Button size="sm" variant="secondary" icon={<X size={14} />} onClick={resetForm}>
                  Cancel
                </Button>
              )}
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
            /* A card per room rather than a table row, because a room is no
               longer just its settings — it is also the people who hold a role
               inside it. */
            <div className="space-y-3">
              {rooms.map((room) => {
                const holders = (roomRoles || []).filter((r) => r.room_id === room.id)
                // The roster minus anyone this room has already overridden —
                // showing both rows for one person would be showing a role they
                // do not have here.
                //
                // Participants and spectators are left out: they are what
                // everybody is by default, so listing them under every room says
                // nothing and buries the people who actually carry a power here.
                // It also makes "Only here" visibly do what it says — the person
                // disappears from the other rooms rather than reappearing as a
                // participant row.
                const overridden = new Set(holders.map((h) => h.user_id))
                const venueWide = (roster || []).filter(
                  (m) =>
                    !overridden.has(m.user_id) &&
                    m.role !== 'participant' &&
                    m.role !== 'spectator'
                )
                return (
                  <div
                    key={room.id}
                    className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ktip-sand-900">{room.name}</p>
                        <p className="mt-0.5 text-xs text-ktip-sand-500">
                          {VENUE_ROOM_KIND_LABELS[room.kind] || room.kind} ·{' '}
                          {room.capacity ?? 'No limit'} · {room.audio_mode}
                          {!room.is_open && ' · closed'}
                        </p>
                      </div>
                      <div className="flex gap-1">
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
                    </div>

                    {/* Everyone who holds a role here: the per-room overrides
                        first, then the venue-wide roster, which applies in every
                        room that has not been told otherwise. Both are shown so
                        there is nowhere else to look. */}
                    <div className="mt-3 border-t border-ktip-sand-200 pt-3">
                      {holders.length === 0 && venueWide.length === 0 ? (
                        <p className="text-xs text-ktip-sand-500">
                          Nobody holds a role here. Everyone registered can still walk in as a
                          participant.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {venueWide.map((m) => (
                            <li key={m.id} className="flex flex-wrap items-center gap-2 opacity-80">
                              <span className="min-w-0 flex-1 truncate text-sm text-ktip-sand-700">
                                {m.user?.display_name || m.user_id.slice(0, 8)}
                              </span>
                              <span className="rounded-lg bg-ktip-sand-100 px-2 py-1 text-xs text-ktip-sand-600">
                                {VENUE_ROLE_LABELS[m.role]}
                              </span>
                              <span
                                className="inline-flex items-center gap-1 text-xs text-ktip-sand-500"
                                title="Their role across the whole venue, so it applies here too"
                              >
                                <Globe size={12} aria-hidden="true" />
                                Everywhere
                              </span>
                              {/* Narrows the role to this room: the overrides on
                                  other rooms go and the venue-wide role drops to
                                  participant, so "only here" is literally true. */}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await scopeToRoom({
                                      eventId,
                                      roomId: room.id,
                                      userId: m.user_id,
                                      role: m.role,
                                    })
                                    toast.success(
                                      `${m.user?.display_name || 'They'} are ${VENUE_ROLE_LABELS[m.role].toLowerCase()} in ${room.name} only`
                                    )
                                  } catch (err: any) {
                                    toast.error(err?.message || 'Could not narrow that role')
                                  }
                                }}
                                className="rounded-lg border border-ktip-sand-200 px-2 py-1 text-xs text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700"
                                title={`Give them this role in ${room.name} and nowhere else`}
                              >
                                Only here
                              </button>
                              {/* The roster row is their membership, so this is
                                  "remove from the venue", not "remove from this
                                  room" — there is nothing room-shaped to remove. */}
                              <button
                                type="button"
                                onClick={() => removeMember({ memberId: m.id, eventId })}
                                aria-label={`Remove ${m.user?.display_name || 'them'} from the venue`}
                                title="Remove from the venue"
                                className="rounded-lg p-1 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-red-600"
                              >
                                <Trash2 size={14} />
                              </button>
                            </li>
                          ))}

                          {holders.map((holder) => (
                            <li key={holder.id} className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm text-ktip-sand-800">
                                {holder.user?.display_name || holder.user_id.slice(0, 8)}
                              </span>
                              <select
                                value={holder.role}
                                onChange={(e) =>
                                  setRoomRole({
                                    eventId,
                                    roomId: room.id,
                                    userId: holder.user_id,
                                    role: e.target.value as VenueRole,
                                  })
                                }
                                aria-label={`Role for ${holder.user?.display_name || 'this person'} in ${room.name}`}
                                className="rounded-lg border border-ktip-sand-200 px-2 py-1 text-xs"
                              >
                                {VENUE_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {VENUE_ROLE_LABELS[r]}
                                  </option>
                                ))}
                              </select>
                              {/* Promotes the role off this room and onto the
                                  roster, which is what "everywhere" is: no
                                  per-room rows at all. */}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await applyEverywhere({
                                      eventId,
                                      userId: holder.user_id,
                                      role: holder.role,
                                    })
                                    toast.success(
                                      `${holder.user?.display_name || 'They'} are now ${VENUE_ROLE_LABELS[holder.role].toLowerCase()} in every room`
                                    )
                                  } catch (err: any) {
                                    toast.error(err?.message || 'Could not apply that everywhere')
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-ktip-sand-200 px-2 py-1 text-xs text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700"
                                title="Give them this role in every room of the venue"
                              >
                                <Globe size={12} aria-hidden="true" />
                                Everywhere
                              </button>
                              <button
                                type="button"
                                onClick={() => clearRoomRole({ eventId, id: holder.id })}
                                aria-label={`Remove ${holder.user?.display_name || 'them'} from ${room.name}`}
                                title="Remove this room role"
                                className="rounded-lg p-1 text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-red-600"
                              >
                                <X size={14} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const opening = inviteRoomId !== room.id
                          setInviteRoomId(opening ? room.id : null)
                          setInviteSearch('')
                          setResultsOpen(opening)
                        }}
                        aria-expanded={inviteRoomId === room.id}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ktip-ocean-600 hover:text-ktip-ocean-700"
                      >
                        <UserPlus size={13} aria-hidden="true" />
                        {inviteRoomId === room.id
                          ? 'Done'
                          : `Give someone a role in ${room.name}`}
                      </button>

                      {/* The picker opens under the room it belongs to, so there
                          is never a question of which room a search result is
                          about to be added to. */}
                      {inviteRoomId === room.id && renderRolePicker(room)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        </>
      )}

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

      {templateDialog && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-ktip-sand-900/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Save as template"
          onClick={() => setTemplateDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ktip-sand-900">
                  Save this building as a template
                </h2>
                <p className="mt-0.5 text-sm text-ktip-sand-600">
                  The rooms and floors as last saved, minus sponsors and team pods. It will appear
                  under “My templates” when you build your next venue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplateDialog(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-medium text-ktip-sand-800">Name</span>
              <input
                type="text"
                value={templateName}
                maxLength={80}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="mb-4 block text-sm">
              <span className="mb-1 block font-medium text-ktip-sand-800">
                Description (optional)
              </span>
              <textarea
                rows={2}
                value={templateDescription}
                maxLength={500}
                onChange={(e) => setTemplateDescription(e.target.value)}
                className="w-full rounded-lg border border-ktip-sand-200 px-3 py-2 text-sm"
              />
            </label>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setTemplateDialog(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!templateName.trim() || savingTemplate}
                onClick={async () => {
                  try {
                    await saveTemplate({
                      eventId,
                      name: templateName.trim(),
                      description: templateDescription.trim() || undefined,
                    })
                    setTemplateDialog(false)
                    toast.success('Template saved')
                  } catch (err: any) {
                    toast.error(err?.message || 'Could not save the template')
                  }
                }}
              >
                Save template
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
