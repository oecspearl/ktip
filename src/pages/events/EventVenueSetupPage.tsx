import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Check, ExternalLink, Info } from 'lucide-react'
import { useEvent, useIsEventHost, useUpdateEvent } from '../../hooks/useEvents'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { mapConfigOf, useSaveVenueMap } from '../../hooks/useVenueMap'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueMapEditor } from '../../components/venue/map/VenueMapEditor'
import { Button } from '../../components/ui/Button'
import { PageHero } from '../../components/layout/PageHero'
import { Stepper } from '../../components/ui/Stepper'
import { setupSteps } from '../../lib/event-blueprints'
import { eventSetupPath, venuePath } from '../../lib/event-slug'
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
  const toast = useToast()

  const { event, loading, refetch } = useEvent(params.slug)
  const { rooms, loading: roomsLoading } = useVenueRooms(event?.id)
  const { saveMap, saving } = useSaveVenueMap()
  const { updateEvent } = useUpdateEvent()

  usePageTitle(event ? `Set up the venue — ${event.title}` : 'Set up the venue')

  const isHost = useIsEventHost(event)

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
    <>
      {/* Same shell as the create form and the other step-two page, so the
          three screens of one flow do not each look like a different product. */}
      <PageHero
        compact
        eyebrow="Set up your event"
        title="Set up the rooms"
        subtitle="Drop the rooms your hackathon needs onto the floor, set who is allowed in each one, and add another level if you want the building to have one. Attendees walk this exact map."
        imageSeed="events"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.title, href: entityPath('event', event) },
          { label: 'The venue' },
        ]}
      />

      <div className="bg-ktip-sand-50 py-12">
        <div className="mx-auto max-w-7xl px-4">
          <Stepper steps={setupSteps(event.event_type)} currentStep={1} className="mb-8" />

        {/* Step one, not the event page: the same "Event details" the stepper
            names, which for an event that already exists is its edit form.
            Addressed by uuid, not slug — EditEventPage saves with
            .eq('id', …), so a slug in the URL loads but cannot save. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to={`/events/${event.id}/edit`}
            className="inline-flex items-center gap-1.5 text-sm text-ktip-sand-600 hover:text-ktip-ocean-600"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to event details
          </Link>

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
            {/* The rooms are half the job. The brief teams build against is
                the other half, and it lives on the shared setup page. */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(eventSetupPath(event))}
            >
              The brief
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

        {/* spectators_enabled has existed since 070 and nothing ever set it, so
            join_venue()'s spectator branch was unreachable and every registrant
            arrived as a participant. This is the switch it was waiting for. */}
        <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-ktip-sand-200 bg-ktip-cream px-3 py-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-ktip-sand-300 text-ktip-ocean-500 focus:ring-ktip-ocean-500/20"
            checked={!!event.spectators_enabled}
            onChange={async (e) => {
              const next = e.currentTarget.checked
              try {
                await updateEvent(event.id, { spectators_enabled: next } as any)
                refetch()
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

          {/* Same shape and place as "Next" on step one, because this is the
              same button at the other end of the same flow. Save lives on the
              editor's own toolbar — this is "I am done", not a second commit. */}
          <div className="mt-10 flex items-center gap-4">
            <Button
              fullWidth
              icon={<Check size={20} />}
              onClick={() => navigate(entityPath('event', event))}
            >
              Finish
            </Button>
            <Link
              to={venuePath(event)}
              className="whitespace-nowrap text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700"
            >
              Open the venue
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
