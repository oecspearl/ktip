import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Map as MapIcon, PencilRuler, Sparkles } from 'lucide-react'
import { useEvent } from '../../hooks/useEvents'
import { venueRoomPath, venueSetupPath } from '../../lib/event-slug'
import { useEnterVenueRoom, useVenueRooms } from '../../hooks/useVenueRooms'
import { useVenuePresenceContext } from '../../contexts/VenuePresenceContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueTopBar } from '../../components/venue/VenueTopBar'
import { VenueAwayBanner } from '../../components/venue/VenueAwayBanner'
import { VenueFloorplan } from '../../components/venue/VenueFloorplan'
import { VenueMapExplorer, canEnterRoom } from '../../components/venue/map/VenueMapExplorer'
import { VenueRoomBrief } from '../../components/venue/map/VenueRoomBrief'
import { RoomOccupantList } from '../../components/venue/RoomOccupantList'
import { VenuePresencePanel } from '../../components/venue/VenuePresencePanel'
import { Button } from '../../components/ui/Button'
import { occupantsInRoom, occupantsUnassigned } from '../../lib/venue-presence'
import { mapConfigOf } from '../../hooks/useVenueMap'
import { autoLayout, isPlaced } from '../../lib/venue-map'
import type { VenueRoom } from '../../types'
import { entityPath } from '../../lib/slug'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The venue floorplan — the front door of a virtual hackathon.
 *
 * Everything live on this page comes from one presence channel. Room occupancy
 * is a client-side reduction over the complete presence state rather than a
 * subscription per room, which is why nine rooms cost one socket.
 */
export default function EventVenuePage() {
    const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  // Addressed by slug — /events/virtual-hackathon/<slug> — so the id only
  // exists once the event has resolved. useEvent takes either shape.
  const { event, loading: eventLoading } = useEvent(params.slug)
  const eventId = event?.id
  usePageTitle(event ? t`Venue — ${event.title}` : t`Venue`)

  // Session and presence live in the layout's provider so the channel is not
  // torn down when a member walks into a room; this page only reads them.
  const { membership, joining, joinError, presence } = useVenuePresenceContext()
  const { rooms, loading: roomsLoading } = useVenueRooms(eventId)
  const { enterRoom } = useEnterVenueRoom()

  const lobby = useMemo(() => occupantsUnassigned(presence.occupants), [presence.occupants])
  const headcount = presence.occupants.filter((o) => o.availability !== 'offline').length

  // The map is the venue. Rooms the host drew keep their geometry; rooms from
  // before the map existed (or seeded from the room list) get auto-arranged, so
  // a venue is never a wall of cards just because nobody opened the builder.
  const mapConfig = useMemo(() => mapConfigOf(event), [event])
  const mapped = useMemo(
    () => autoLayout(rooms || [], mapConfig).filter(isPlaced),
    [rooms, mapConfig]
  )
  const unmappedIds = useMemo(() => {
    const ids = new Set(mapped.map((r) => r.id))
    return (rooms || []).filter((r) => !ids.has(r.id))
  }, [rooms, mapped])

  // The room being stood in, reported by the map. Not the same thing as being
  // *in* a room: entering is still a decision, and this is what informs it.
  const [standingRoomId, setStandingRoomId] = useState<string | null>(null)
  const [previewRoomId, setPreviewRoomId] = useState<string | null>(null)

  // Walking into a room answers the question the preview was asking, so the
  // room underfoot takes the panel back.
  const handleStandingRoom = useCallback((roomId: string | null) => {
    setStandingRoomId(roomId)
    if (roomId) setPreviewRoomId(null)
  }, [])

  const standingRoom = useMemo(
    () => mapped.find((r) => r.id === standingRoomId) ?? null,
    [mapped, standingRoomId]
  )

  // The room being pointed at. Clicking a room walks you into it, so hover is
  // what someone who only wants to look has — and while they are looking it
  // takes the panel over from whatever they happen to be standing in.
  //
  // Latched, not tracked: the panel it fills sits off the map, so clearing on
  // pointer-out would take the card away the moment someone moved towards its
  // Enter button. It holds until another room is pointed at, until the room
  // underfoot changes, or until it is dismissed.
  const handlePreviewRoom = useCallback((roomId: string | null) => {
    if (roomId) setPreviewRoomId(roomId)
  }, [])

  const previewRoom = useMemo(
    () => mapped.find((r) => r.id === previewRoomId) ?? null,
    [mapped, previewRoomId]
  )
  const briefRoom = previewRoom ?? standingRoom

  // The idle rule only ever fires while this tab is hidden, and coming back to
  // the tab clears it — so a banner keyed on "is away right now" would be gone
  // before it was ever on screen. It latches instead, and stays until the
  // member either says they are back or dismisses it.
  const autoAway =
    presence.availability === 'away' && (presence.manual === null || presence.manual === 'working')
  const [awayNotice, setAwayNotice] = useState(false)
  useEffect(() => {
    if (autoAway) setAwayNotice(true)
  }, [autoAway])


  // Returns whether entry went through, so the map can pull its camera back
  // out on a refusal instead of staying behind the entry veil.
  const handleEnter = async (room: VenueRoom) => {
    if (!eventId || !event) return false
    try {
      await enterRoom(eventId, room.id)
      navigate(venueRoomPath(event, room.key))
      return true
    } catch (err: any) {
      toast.error(err?.message || t`Could not enter that room`)
      return false
    }
  }

  if (eventLoading || joining) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
        <div className="h-14 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900"><Trans>Event not found</Trans></h1>
        <Link to="/events" className="mt-3 inline-block text-ktip-ocean-600 hover:underline">
          <Trans>Browse events</Trans>
        </Link>
      </div>
    )
  }

  if (!event.has_venue) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <MapIcon size={32} className="mx-auto mb-3 text-ktip-sand-400" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          <Trans>This event has no virtual venue</Trans>
        </h1>
        <p className="mt-2 text-ktip-sand-600">
          <Trans>The organizer has not turned one on. Everything about the event is on its main page.</Trans>
        </p>
        <Link
          to={entityPath('event', event)}
          className="mt-4 inline-block text-ktip-ocean-600 hover:underline"
        >
          <Trans>Go to {event.title}</Trans>
        </Link>
      </div>
    )
  }

  // join_venue raises rather than returning null — "register first" is an
  // answer, not a failure, so it is rendered as one.
  if (joinError || !membership) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          <Trans>You are not in this venue yet</Trans>
        </h1>
        <p className="mt-2 text-ktip-sand-600">
          {(joinError as any)?.message || t`Register for this event to enter the venue.`}
        </p>
        <Link to={entityPath('event', event)} className="mt-5 inline-block">
          <Button><Trans>Go to the event page</Trans></Button>
        </Link>
      </div>
    )
  }

  return (
    // The map is the page: one viewport-high column — strip, banner, floor —
    // and nothing to scroll (the layout drops its footer on this route).
    // pt clears the fixed navbar: this page has no PageHero, so without it the
    // sticky VenueTopBar (and its back link) renders underneath the bar and the
    // click lands on the navbar logo instead.
    <div className="flex h-[100svh] flex-col bg-ktip-canvas pt-[var(--nav-h)]">
      <VenueTopBar
        eventId={event.id}
        eventSlug={event.slug}
        eventType={event.event_type}
        eventTitle={event.title}
        headcount={headcount}
        connected={presence.connected}
        availability={presence.availability}
        isAuto={presence.manual === null || presence.manual !== presence.availability}
        onAvailabilityChange={presence.setAvailability}
        titleAs="h1"
        trailing={
          membership.role === 'organizer' && (
            <Link to={venueSetupPath(event)} aria-label={t`Edit the map`} title={t`Edit the map`}>
              <Button
                size="sm"
                variant="secondary"
                className="px-2.5"
                icon={<PencilRuler size={15} aria-hidden="true" />}
              />
            </Link>
          )
        }
      />

      {awayNotice && (
        <VenueAwayBanner
          stillAway={autoAway}
          onResume={() => {
            presence.setAvailability('working')
            setAwayNotice(false)
          }}
          onDismiss={() => setAwayNotice(false)}
        />
      )}

      <div data-tutorial="venue-floorplan" className="relative min-h-0 flex-1">
        {roomsLoading ? (
          <div className="h-full bg-ktip-sand-100 animate-pulse-soft" />
        ) : !rooms || rooms.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-8 text-center">
              <MapIcon size={28} className="mx-auto mb-3 text-ktip-sand-400" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-ktip-sand-900">
                <Trans>The venue has no rooms yet</Trans>
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-ktip-sand-600">
                {membership.role === 'organizer'
                  ? t`Open the Venue tab on the admin page for this event and create the rooms — there is a one-click starter set.`
                  : t`The organizer is still setting up. Check back shortly.`}
              </p>
              {membership.role === 'organizer' && (
                <Link to={`/admin/events/${event.id}`} className="mt-4 inline-block">
                  <Button size="sm" icon={<Sparkles size={15} />}>
                    <Trans>Set up the venue</Trans>
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ) : mapped.length > 0 ? (
          <>
            <VenueMapExplorer
              frameless
              config={mapConfig}
              rooms={mapped}
              occupants={presence.occupants}
              occupancy={presence.occupancy}
              meId={auth.user?.id || ''}
              myName={auth.profile?.display_name || t`You`}
              myAvatarUrl={auth.profile?.avatar_url ?? null}
              myRole={membership.role}
              peers={presence.positions.peers}
              // Set only when this member was inside a room a moment ago,
              // which is what plays the entry animation in reverse.
              arriveFromRoomId={membership.current_room_id}
              onPositionChange={presence.setPosition}
              onStandingRoomChange={handleStandingRoom}
              onPreviewRoomChange={handlePreviewRoom}
              onEnter={handleEnter}
            />

            <VenuePresencePanel occupants={lobby}>
              {/* Standing in a doorway — or pointing at a room from the map or
                  the rail — is the moment someone wants to know what they are
                  about to walk into, so the room's rules appear here before
                  they commit to entering it. */}
              {briefRoom && (
                <div className="pointer-events-auto min-h-0 w-full shrink-0 overflow-y-auto">
                  <VenueRoomBrief
                    room={briefRoom}
                    here={presence.occupancy[briefRoom.id] || 0}
                    occupants={occupantsInRoom(presence.occupants, briefRoom.id)}
                    canEnter={canEnterRoom(briefRoom, membership.role)}
                    mode={previewRoom ? 'preview' : 'standing'}
                    onDismiss={previewRoom ? () => setPreviewRoomId(null) : undefined}
                    onEnter={() => handleEnter(briefRoom)}
                  />
                </div>
              )}

              {/* A room that would not fit on the grid is still a room. Same
                  reasoning as the SVG path's "Not on the map" list — but as a
                  compact card: VenueFloorplan's viewport-breakpoint grid would
                  render broken columns inside an 18rem panel. */}
              {unmappedIds.length > 0 && (
                <div className="pointer-events-auto min-h-0 w-full overflow-y-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream/95 shadow-card backdrop-blur">
                  <p className="border-b border-ktip-sand-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
                    <Trans>Not on the map</Trans>
                  </p>
                  <ul className="divide-y divide-ktip-sand-100">
                    {unmappedIds.map((room) => (
                      <li key={room.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ktip-sand-900">
                            {room.name}
                          </span>
                          <span className="text-xs text-ktip-sand-500">
                            <Trans>{presence.occupancy[room.id] || 0} here</Trans>
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!canEnterRoom(room, membership.role)}
                          onClick={() => handleEnter(room)}
                        >
                          <Trans>Enter</Trans>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </VenuePresencePanel>
          </>
        ) : (
          // Legacy fallback: no room has map geometry, so the old two-column
          // card layout stays, scrolling inside the viewport-high shell.
          <div className="h-full overflow-y-auto p-4 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <VenueFloorplan
                rooms={rooms}
                occupants={presence.occupants}
                currentRoomId={null}
                floorplanUrl={event.venue_floorplan_url}
                onEnter={handleEnter}
              />
              <aside className="space-y-4">
                <RoomOccupantList
                  occupants={lobby}
                  title={t`In the venue`}
                  emptyLabel={t`Everyone is inside a room.`}
                />
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
