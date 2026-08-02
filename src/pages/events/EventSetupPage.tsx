import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Check, ExternalLink, Info } from 'lucide-react'
import { useEvent, useIsEventHost } from '../../hooks/useEvents'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Button } from '../../components/ui/Button'
import { Stepper } from '../../components/ui/Stepper'
import { PageHero } from '../../components/layout/PageHero'
import { blueprintFor, setupSteps, type SetupSection } from '../../lib/event-blueprints'
import { entityPath } from '../../lib/slug'
import { venueSetupPath } from '../../lib/event-slug'
import AdminEventChallengeTab from '../admin/events/AdminEventChallengeTab'
import AdminEventScheduleTab from '../admin/events/AdminEventScheduleTab'
import AdminEventSpeakersTab from '../admin/events/AdminEventSpeakersTab'

/**
 * Step two for every event type that has one, except the hackathon — its step
 * two is a full-width map canvas and keeps the page it already had.
 *
 * One page rather than four near-identical ones: the blueprint says which
 * sections this type needs and in what order, and each section is an editor
 * that already exists in the admin console. Nothing here is a second copy of
 * an editor; it is the same component reached from a page the host who just
 * pressed "Create event" will actually find.
 *
 * Access is the event's organizer or a platform admin. RLS enforces the same
 * thing (010 and 062 both grant organizers management of their own rows), so
 * this gate keeps people out of a screen they could not save from — it is not
 * the control itself.
 */
export default function EventSetupPage() {
  const params = useParams()
  const navigate = useNavigate()

  const { event, loading, refetch } = useEvent(params.slug)
  const isHost = useIsEventHost(event)

  usePageTitle(event ? `Set up — ${event.title}` : 'Set up the event')

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
        <div className="h-14 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-[28rem] rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
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
          Only the organizer can set this event up
        </h1>
        <Link to={entityPath('event', event)} className="mt-4 inline-block">
          <Button variant="secondary">Go to the event</Button>
        </Link>
      </div>
    )
  }

  const blueprint = blueprintFor(event.event_type)

  // A meetup has nothing to configure, and a hackathon configures its rooms on
  // the venue page. Either way the URL is reachable, so it answers rather than
  // rendering an empty shell.
  if (!blueprint.setup) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          Nothing to set up here
        </h1>
        <p className="mt-2 text-sm text-ktip-sand-600">
          A {event.event_type.replace('_', ' ')} is finished the moment it is created.
        </p>
        <Link to={entityPath('event', event)} className="mt-4 inline-block">
          <Button variant="secondary">Go to the event</Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Same shell as the create form this page is the second half of. Without
          it the navbar has no band to sit on and step two reads as a different
          product from step one. */}
      <PageHero
        compact
        eyebrow="Set up your event"
        title={capitalize(blueprint.setup.label)}
        subtitle={blueprint.setup.blurb}
        imageSeed="events"
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.title, href: entityPath('event', event) },
          { label: 'Set up' },
        ]}
      />

      <div className="bg-ktip-sand-50 py-12">
        <div className="mx-auto max-w-page-tight px-4">
          <Stepper steps={setupSteps(event.event_type)} currentStep={1} className="mb-8" />

          {/* Step one, not the event page: this is the same "Event details"
              the stepper names, which for an event that already exists is its
              edit form. Addressed by uuid, not slug — EditEventPage saves with
              .eq('id', …), so a slug in the URL loads but cannot save. */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              to={`/events/${event.id}/edit`}
              className="inline-flex items-center gap-1.5 text-sm text-ktip-sand-600 hover:text-ktip-ocean-600"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              Back to event details
            </Link>

            {/* A hackathon lands on the venue page first, but its brief lives
                here — so the two step-two screens link to each other. */}
            {event.has_venue && (
              <Button
                size="sm"
                variant="secondary"
                icon={<ExternalLink size={14} />}
                onClick={() => navigate(venueSetupPath(event))}
              >
                The venue
              </Button>
            )}
          </div>

          {event.status === 'draft' && (
            <p className="mb-8 flex items-start gap-2 rounded-xl border border-ktip-sun-200 bg-ktip-sun-50 px-3 py-2 text-sm text-ktip-sun-800">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              This event is still a draft, so nobody can see it yet. Everything you add here is
              saved and waiting for you to publish it.
            </p>
          )}

          <div className="space-y-10">
            {blueprint.setup.sections
              .filter((section) => section !== 'venue')
              .map((section) => (
                <section key={section}>
                  <h2 className="mb-3 font-display text-lg font-semibold text-ktip-sand-900">
                    {SECTION_TITLES[section]}
                  </h2>
                  {renderSection(section, event, refetch)}
                </section>
              ))}
          </div>

          {/* Same shape and place as "Next" on step one, because this is the
              same button at the other end of the same flow. Each section above
              saves itself, so this is "I am done", not a commit. */}
          <div className="mt-10 flex items-center gap-4">
            <Button
              fullWidth
              icon={<Check size={20} />}
              onClick={() => navigate(entityPath('event', event))}
            >
              Finish
            </Button>
            <Link
              to={entityPath('event', event)}
              className="whitespace-nowrap text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700"
            >
              View the event
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

const SECTION_TITLES: Record<SetupSection, string> = {
  speakers: 'Who is speaking',
  schedule: 'The programme',
  challenge: 'The brief',
  judging: 'How pitches are scored',
  pages: 'Pages on the event',
  venue: 'The venue',
}

function renderSection(
  section: SetupSection,
  event: { id: string; has_challenge: boolean; submission_deadline: string | null },
  refetch: () => void
) {
  switch (section) {
    case 'speakers':
      return <AdminEventSpeakersTab eventId={event.id} />
    case 'schedule':
      return <AdminEventScheduleTab eventId={event.id} />
    case 'challenge':
    case 'judging':
      return (
        <AdminEventChallengeTab
          eventId={event.id}
          hasChallenge={event.has_challenge}
          submissionDeadline={event.submission_deadline}
          onEventChange={refetch}
          mode={section === 'judging' ? 'judging' : 'full'}
        />
      )
    case 'pages':
      // The page builder is a genuinely admin-shaped tool — drag-ordered
      // sections with raw JSON content — so it stays where it is and this
      // points at it rather than embedding it.
      return (
        <div className="rounded-xl border border-ktip-sand-200 bg-ktip-cream p-6">
          <p className="text-sm text-ktip-sand-600">
            Sponsors, an FAQ and any other standalone pages are built from the event's admin
            console, where they can be reordered and hidden.
          </p>
          <Link to={`/admin/events/${event.id}`} className="mt-3 inline-block">
            <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />}>
              Open the page builder
            </Button>
          </Link>
        </div>
      )
    default:
      return null
  }
}

function capitalize(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1)
}
