import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ExternalLink, Info } from 'lucide-react'
import { useEvent, useUpdateEvent } from '../../hooks/useEvents'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { mapConfigOf, useSaveVenueMap } from '../../hooks/useVenueMap'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueMapEditor } from '../../components/venue/map/VenueMapEditor'
import { Button } from '../../components/ui/Button'
import { venuePath } from '../../lib/event-slug'
import { entityPath } from '../../lib/slug'

/**
 * Step two of creating a hackathon: build the place it happens in.
 *
 * Creating the event and drawing its venue are one job done in two sittings,
 * so this is a page of its own rather than another tab in the admin console —
 * the host who just pressed "Create event" lands here, and the link keeps
 * working afterwards for anyone who wants to rearrange the rooms.
 *
 * Access is the event's organizer or a platform admin. The RPC checks the same
 * thing server-side (`is_venue_host`), so this gate is a courtesy, not the
 * control.
 */
export default function EventVenueSetupPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const { event, loading, refetch } = useEvent(params.slug)
  const { rooms, loading: roomsLoading } = useVenueRooms(event?.id)
  const { saveMap, saving } = useSaveVenueMap()
  const { updateEvent } = useUpdateEvent()

  usePageTitle(event ? `Set up the venue — ${event.title}` : 'Set up the venue')

  const isHost = useMemo(() => {
    if (!event || !auth.user) return false
    if (event.organizer_id === auth.user.id) return true
    const roles = auth.profile?.roles || []
    return roles.includes('oecs') || roles.includes('super_admin')
  }, [event, auth.user, auth.profile])

  const config = useMemo(() => mapConfigOf(event), [event])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
        <div className="h-14 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-[34rem] rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">Event not found</h1>
        <Link to="/events" className="mt-3 inline-block text-ktip-ocean-600 hover:underline">
          Browse events
        </Link>
      </div>
    )
  }

  if (!isHost) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          Only the organizer can set up this venue
        </h1>
        <Link to={venuePath(event)} className="mt-4 inline-block">
          <Button variant="secondary">Go to the venue</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ktip-canvas pb-16 pt-[calc(var(--nav-h)+1.5rem)]">
      <div className="mx-auto max-w-7xl px-4">
        <Link
          to={entityPath('event', event)}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-ktip-sand-600 hover:text-ktip-ocean-600"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {event.title}
        </Link>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ktip-ocean-600">
              Step 2 · The venue
            </p>
            <h1 className="font-display text-2xl font-bold text-ktip-sand-900 md:text-3xl">
              Set up the rooms
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ktip-sand-600">
              Drop the rooms your hackathon needs onto the floor, set who is allowed in each one,
              and add another level if you want the building to have one. Attendees walk this exact
              map.
            </p>
          </div>

          <div className="flex gap-2">
            {!event.has_venue && (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await updateEvent(event.id, { has_venue: true } as any)
                    refetch()
                    toast.success('Venue turned on')
                  } catch (err: any) {
                    toast.error(err?.message || 'Could not turn the venue on')
                  }
                }}
              >
                Turn the venue on
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={<ExternalLink size={14} />}
              onClick={() => navigate(venuePath(event))}
            >
              Open the venue
            </Button>
            {/* The way out. Save lives on the editor's own toolbar — this is
                "I am done for now", not a second commit. */}
            <Button size="sm" variant="secondary" onClick={() => navigate(entityPath('event', event))}>
              Finish
            </Button>
          </div>
        </div>

        {!event.has_venue && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-ktip-sun-200 bg-ktip-sun-50 px-3 py-2 text-sm text-ktip-sun-800">
            <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            The venue is off, so nobody can enter yet. You can still draw it — turn it on when you
            are ready.
          </p>
        )}

        {roomsLoading ? (
          <div className="h-[34rem] rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        ) : (
          <VenueMapEditor
            rooms={rooms}
            config={config}
            saving={saving}
            onSave={async (nextConfig, payload) => {
              try {
                await saveMap({ eventId: event.id, map: nextConfig, rooms: payload })
                refetch()
                toast.success('Venue saved')
              } catch (err: any) {
                toast.error(err?.message || 'Could not save the venue')
                throw err
              }
            }}
          />
        )}
      </div>
    </div>
  )
}
