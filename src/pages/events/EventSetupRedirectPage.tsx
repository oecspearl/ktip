import { Navigate, useParams } from 'react-router'
import { useEvent } from '../../hooks/useEvents'
import { setupSteps } from '../../lib/event-blueprints'
import { eventManagePath } from '../../lib/event-slug'

/**
 * Keeps the old setup URLs alive.
 *
 * /events/<slug>/setup                       → /events/<slug>/manage?tab=…&setup=1
 * /events/virtual-hackathon/<slug>/setup     → the same, opened on the venue tab
 * /events/virtual-conference/<slug>/setup    → likewise
 *
 * Setting an event up was two standalone pages (089, 092) that mounted the
 * management console's own editors a second time and then handed you to the
 * console anyway. They are gone; the console draws a stepper over its tabs
 * instead. These addresses are in the create flow's history, in bookmarks and
 * in anything a host has shared, so they land on the step they used to be.
 */
export default function EventSetupRedirectPage() {
  const params = useParams()
  const { event, loading } = useEvent(params.slug)

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-8 pt-[calc(var(--nav-h)+2rem)]">
        <div className="h-14 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
        <div className="h-96 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
      </div>
    )
  }

  if (!event) return <Navigate to="/events" replace />

  // Step one is always the details the host has already filled in, so the old
  // setup links resolve to step two — the venue for a type that has one, the
  // brief or the programme otherwise.
  const steps = setupSteps(event.event_type)
  const landing = steps[1] ?? steps[0]

  return (
    <Navigate
      to={eventManagePath(event, { tab: landing.tab, setup: steps.length > 1 })}
      replace
    />
  )
}
