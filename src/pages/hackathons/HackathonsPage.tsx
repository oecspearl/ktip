import { useMemo } from 'react'
import { Link } from 'react-router'
import { Calendar, MapPin, Radio, Trophy, Users } from 'lucide-react'
import { useEvents } from '../../hooks/useEvents'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useTranslatedFields } from '../../hooks/useTranslated'
import { PageHero } from '../../components/layout/PageHero'
import { Button } from '../../components/ui/Button'
import { EventCard } from '../../components/events/EventCard'
import { formatDate } from '../../lib/utils'
import { venuePath } from '../../lib/event-slug'
import type { Event } from '../../types'
import { entityPath } from '../../lib/slug'
import { Plural, Trans, useLingui } from '@lingui/react/macro'

/**
 * The Virtual Hackathon index — and the only static route in this feature.
 *
 * Everything deeper is parameterised by event id, and site-map hrefs cannot
 * contain a `:id` (src/lib/site-search.test.ts matches route paths literally),
 * so this page is the single discoverable entry point. The deeper surfaces get
 * `howTo`-only site-map entries instead.
 */
export default function HackathonsPage() {
    const { t } = useLingui()
  usePageTitle(t`Virtual Hackathon`)

  const { events, loading } = useEvents({ type: 'hackathon' })

  const { live, upcoming, past } = useMemo(() => {
    const now = Date.now()
    const all = events || []

    const isLive = (e: Event) => {
      const start = Date.parse(e.start_date)
      const end = e.end_date ? Date.parse(e.end_date) : start + 24 * 60 * 60 * 1000
      return e.status === 'published' && now >= start && now <= end
    }

    return {
      live: all.filter(isLive),
      upcoming: all.filter((e) => Date.parse(e.start_date) > now && e.status === 'published'),
      past: all
        .filter((e) => !isLive(e) && Date.parse(e.start_date) <= now)
        .sort((a, b) => Date.parse(b.start_date) - Date.parse(a.start_date)),
    }
  }, [events])

  return (
    // No scrollspy rail: the three sections are card grids that are usually a
    // screen between them, and two of the three are empty most of the year.
    // The markers stay — the tour in data/tutorials/listings.ts anchors to them.
    <div data-spy-off className="min-h-screen bg-ktip-canvas">
      <PageHero
        eyebrow={t`Virtual Hackathon`}
        title={t`Build something in a weekend`}
        subtitle={t`A live venue with rooms, teams, mentors and judging — all in the browser.`}
        imageSeed="hackathon"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Events`, href: '/events' },
          { label: t`Virtual Hackathon` },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-10">
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 rounded-2xl bg-ktip-sand-100 animate-pulse-soft" />
            ))}
          </div>
        ) : (
          <>
            {/* Happening now gets its own treatment — a live venue is the one
                thing on this page with a deadline attached to reading it. */}
            {live.length > 0 && (
              <section id="live" data-spy="Live" className="scroll-mt-24 mb-12">
                <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold text-ktip-sand-900">
                  <Radio size={18} className="text-ktip-tropical-700" aria-hidden="true" />
                  <Trans>Happening now</Trans>
                </h2>
                <div className="space-y-4">
                  {live.map((event) => (
                    <LiveHackathonRow key={event.id} event={event} />
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section id="upcoming" data-spy="Coming up" className="scroll-mt-24 mb-12">
                <h2 className="mb-4 font-display text-xl font-bold text-ktip-sand-900"><Trans>Coming up</Trans></h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section id="past" data-spy="Past" className="scroll-mt-24">
                <h2 className="mb-4 font-display text-xl font-bold text-ktip-sand-900"><Trans>Past</Trans></h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {past.slice(0, 6).map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            )}

            {live.length === 0 && upcoming.length === 0 && past.length === 0 && (
              <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-12 text-center">
                <Trophy size={30} className="mx-auto mb-3 text-ktip-sand-400" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-ktip-sand-900">
                  <Trans>No hackathons scheduled yet</Trans>
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-ktip-sand-600">
                  <Trans>When one is announced it will show up here, along with a way into the live venue.</Trans>
                </p>
                <Link to="/events" className="mt-5 inline-block">
                  <Button variant="secondary"><Trans>Browse all events</Trans></Button>
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function LiveHackathonRow({ event: source }: { event: Event }) {
    const { t } = useLingui()
  const event = useTranslatedFields(source, ['title', 'summary', 'location']) ?? source
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-ktip-tropical-200 bg-ktip-cream p-5 shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-ktip-tropical-200 bg-ktip-tropical-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-ktip-tropical-800">
          <Radio size={11} aria-hidden="true" /> <Trans>Live</Trans>
        </span>
        <h3 className="font-display text-lg font-bold text-ktip-sand-900">
          <Link to={entityPath('event', event)} className="hover:text-ktip-ocean-600 hover:underline">
            {event.title}
          </Link>
        </h3>
        {event.summary && (
          <p className="mt-1 line-clamp-2 text-sm text-ktip-sand-600">{event.summary}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ktip-sand-500">
          <span className="flex items-center gap-1">
            <Calendar size={12} aria-hidden="true" />
            {formatDate(event.start_date, 'MMM d, h:mm a')}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={12} aria-hidden="true" />
            {event.is_virtual ? t`Virtual` : event.location || t`Location TBA`}
          </span>
          {event.capacity != null && (
            <span className="flex items-center gap-1">
              <Users size={12} aria-hidden="true" />
              <Plural value={event.capacity} one="# place" other="# places" />
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {event.has_venue && (
          <Link to={venuePath(event)}>
            <Button size="sm"><Trans>Enter the venue</Trans></Button>
          </Link>
        )}
        <Link to={entityPath('event', event)}>
          <Button size="sm" variant="secondary">
            <Trans>Details</Trans>
          </Button>
        </Link>
      </div>
    </div>
  )
}
