import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, BookmarkPlus, Check, ExternalLink, Info, X } from 'lucide-react'
import { useEvent, useIsEventHost, useUpdateEvent } from '../../hooks/useEvents'
import { useVenueRooms } from '../../hooks/useVenueRooms'
import { mapConfigOf, useSaveVenueMap } from '../../hooks/useVenueMap'
import { useSaveVenueTemplate, useVenueTemplates } from '../../hooks/useVenueTemplates'
import { useToast } from '../../contexts/ToastContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { VenueMapEditor } from '../../components/venue/map/VenueMapEditor'
import { Button } from '../../components/ui/Button'
import { PageHero } from '../../components/layout/PageHero'
import { Stepper } from '../../components/ui/Stepper'
import { setupSteps } from '../../lib/event-blueprints'
import { eventSetupPath, venuePath } from '../../lib/event-slug'
import { venueCopy } from '../../lib/venue-copy'
import { entityPath } from '../../lib/slug'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * Step two of creating a hackathon or a conference: build the place it
 * happens in.
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
    const { t, i18n } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const { event, loading, refetch } = useEvent(params.slug)
  const { rooms, loading: roomsLoading } = useVenueRooms(event?.id)
  const { saveMap, saving } = useSaveVenueMap()
  const { updateEvent } = useUpdateEvent()
  const { templates } = useVenueTemplates()
  const { saveTemplate, saving: savingTemplate } = useSaveVenueTemplate()

  const [templateDialog, setTemplateDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')

  usePageTitle(event ? t`Set up the venue — ${event.title}` : t`Set up the venue`)

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
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900"><Trans>Event not found</Trans></h1>
        <Link to="/events" className="mt-3 inline-block text-ktip-ocean-600 hover:underline">
          <Trans>Browse events</Trans>
        </Link>
      </div>
    )
  }

  if (!isHost) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(var(--nav-h)+4rem)] text-center">
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">
          <Trans>Only the organizer can set up this venue</Trans>
        </h1>
        <Link to={venuePath(event)} className="mt-4 inline-block">
          <Button variant="secondary"><Trans>Go to the venue</Trans></Button>
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
        eyebrow={t`Set up your event`}
        title={t`Set up the rooms`}
        subtitle={i18n._(venueCopy(event.event_type, 'setupSubtitle'))}
        imageSeed="events"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Events`, href: '/events' },
          { label: event.title, href: entityPath('event', event) },
          { label: t`The venue` },
        ]}
      />

      <div className="bg-ktip-sand-50 py-12">
        <div className="mx-auto max-w-7xl px-4">
          <Stepper steps={setupSteps(event.event_type)} currentStep={1} className="mb-8" />

        {/* Step one, not the event page: the same "Event details" the stepper
            names, which for an event that already exists is the Details tab of
            its management workspace. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to={`/events/${event.id}/manage`}
            className="inline-flex items-center gap-1.5 text-sm text-ktip-sand-600 hover:text-ktip-ocean-600"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <Trans>Back to event details</Trans>
          </Link>

          <div className="flex gap-2">
            {!event.has_venue && (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await updateEvent(event.id, { has_venue: true } as any)
                    refetch()
                    toast.success(t`Venue turned on`)
                  } catch (err: any) {
                    toast.error(err?.message || t`Could not turn the venue on`)
                  }
                }}
              >
                <Trans>Turn the venue on</Trans>
              </Button>
            )}
            {/* Snapshot the drawn building for the host's next event. Only
                offered once there is something drawn AND saved — the RPC reads
                the rows, not the editor's draft. */}
            {(rooms?.length ?? 0) > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={<BookmarkPlus size={14} />}
                onClick={() => {
                  setTemplateName(event.title)
                  setTemplateDescription('')
                  setTemplateDialog(true)
                }}
              >
                <Trans>Save as template</Trans>
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={<ExternalLink size={14} />}
              onClick={() => navigate(venuePath(event))}
            >
              <Trans>Open the venue</Trans>
            </Button>
            {/* The rooms are half the job. The other half — the brief for a
                hackathon, the programme for a conference — lives on the shared
                setup page. */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(eventSetupPath(event))}
            >
              {i18n._(venueCopy(event.event_type, 'continueLabel'))}
            </Button>
          </div>
        </div>

        {!event.has_venue && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-ktip-sun-200 bg-ktip-sun-50 px-3 py-2 text-sm text-ktip-sun-800">
            <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <Trans>
              The venue is off, so nobody can enter yet. You can still draw it — turn it on when you
              are ready.
            </Trans>
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
                toast.success(next ? t`Viewers can now register` : t`Viewers turned off`)
              } catch (err: any) {
                toast.error(err?.message || t`Could not change who may watch`)
              }
            }}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ktip-sand-800">
              <Trans>Let people register as viewers</Trans>
            </span>
            <span className="block text-xs text-ktip-sand-500">
              <Trans>Viewers watch the rooms without joining a team or submitting, and do not take up a participant place. Off means everyone who registers is competing.</Trans>
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
              eventType={event.event_type}
              savedTemplates={templates}
              draftKey={event.id}
              onSave={async (nextConfig, payload) => {
                try {
                  await saveMap({ eventId: event.id, map: nextConfig, rooms: payload })
                  refetch()
                  toast.success(t`Venue saved`)
                } catch (err: any) {
                  toast.error(err?.message || t`Could not save the venue`)
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
              <Trans>Finish</Trans>
            </Button>
            <Link
              to={venuePath(event)}
              className="whitespace-nowrap text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700"
            >
              <Trans>Open the venue</Trans>
            </Link>
          </div>
        </div>
      </div>

      {templateDialog && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-ktip-sand-900/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t`Save as template`}
          onClick={() => setTemplateDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-ktip-sand-900">
                  <Trans>Save this building as a template</Trans>
                </h2>
                <p className="mt-0.5 text-sm text-ktip-sand-600">
                  <Trans>
                    The rooms and floors as last saved, minus sponsors and team pods. It will appear
                    under “My templates” when you build your next venue.
                  </Trans>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplateDialog(false)}
                aria-label={t`Close`}
                className="rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block font-medium text-ktip-sand-800"><Trans>Name</Trans></span>
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
                <Trans>Description (optional)</Trans>
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
                <Trans>Cancel</Trans>
              </Button>
              <Button
                size="sm"
                disabled={!templateName.trim() || savingTemplate}
                onClick={async () => {
                  try {
                    await saveTemplate({
                      eventId: event.id,
                      name: templateName.trim(),
                      description: templateDescription.trim() || undefined,
                    })
                    setTemplateDialog(false)
                    toast.success(t`Template saved`)
                  } catch (err: any) {
                    toast.error(err?.message || t`Could not save the template`)
                  }
                }}
              >
                <Trans>Save template</Trans>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
