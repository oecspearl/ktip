import { useState, type ComponentType } from 'react'
import { Bot, CloudOff, DatabaseZap, GitMerge, RouteOff, ShieldAlert } from 'lucide-react'
import { PageHero } from '../../../components/layout/PageHero'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { useToast } from '../../../contexts/ToastContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { captureSimulatedError } from '../../../lib/monitoring'
import { SAFE_MESSAGES, type ErrorCode } from '../../../lib/app-error'

/**
 * Verifies the monitoring pipeline end to end: SDK init, scrubbing, transport,
 * and the grouping rules on /admin/errors.
 *
 * Lives in the admin area rather than behind a DEV flag because the thing worth
 * proving is that *production* reporting works — a dev-only simulator can only
 * confirm the dev DSN. It is gated by AdminRoute, and each event is tagged
 * `simulated: true` so a real incident is never confused with a drill.
 */

interface ErrorScenario {
  title: string
  description: string
  area: string
  operation: string
  errorCode: ErrorCode
  errorName: string
  level: 'error' | 'warning'
  icon: ComponentType<{ size?: number; className?: string }>
  iconClass: string
  iconBackground: string
}

const scenarios: ErrorScenario[] = [
  {
    title: 'Data API unavailable',
    description: 'Simulates PostgREST being unable to serve public projects, events, or grants.',
    area: 'data-api',
    operation: 'load-public-content',
    errorCode: 'DATA_API_UNAVAILABLE',
    errorName: 'DataApiUnavailableError',
    level: 'error',
    icon: DatabaseZap,
    iconClass: 'text-red-600',
    iconBackground: 'bg-red-50',
  },
  {
    title: 'Session refresh failed',
    description: 'Simulates an expired or revoked authentication session that cannot be refreshed.',
    area: 'authentication',
    operation: 'refresh-session',
    errorCode: 'AUTH_SESSION_REFRESH_FAILED',
    errorName: 'AuthenticationSessionError',
    level: 'warning',
    icon: ShieldAlert,
    iconClass: 'text-ktip-sun-700',
    iconBackground: 'bg-ktip-sun-50',
  },
  {
    title: 'Application API error',
    description: 'Simulates an unexpected 500 response from an account or administration endpoint.',
    area: 'api',
    operation: 'server-request',
    errorCode: 'API_INTERNAL_SERVER_ERROR',
    errorName: 'ApplicationApiError',
    level: 'error',
    icon: CloudOff,
    iconClass: 'text-red-600',
    iconBackground: 'bg-red-50',
  },
  {
    title: 'AI provider failure',
    description: 'Simulates the AI assistant timing out or receiving an upstream provider error.',
    area: 'ai-assistant',
    operation: 'generate-response',
    errorCode: 'AI_PROVIDER_REQUEST_FAILED',
    errorName: 'AiProviderError',
    level: 'error',
    icon: Bot,
    iconClass: 'text-ktip-ocean-700',
    iconBackground: 'bg-ktip-ocean-50',
  },
  {
    title: 'Collaboration save failed',
    description: 'Simulates document or whiteboard changes failing to persist after editing.',
    area: 'collaboration',
    operation: 'save-changes',
    errorCode: 'COLLABORATION_SAVE_FAILED',
    errorName: 'CollaborationPersistenceError',
    level: 'error',
    icon: GitMerge,
    iconClass: 'text-ktip-tropical-700',
    iconBackground: 'bg-ktip-tropical-50',
  },
  {
    title: 'Route bundle failed',
    description: 'Simulates a lazy-loaded page failing after a deployment or network interruption.',
    area: 'routing',
    operation: 'lazy-import',
    errorCode: 'ROUTE_IMPORT_FAILED',
    errorName: 'RouteImportError',
    level: 'error',
    icon: RouteOff,
    iconClass: 'text-ktip-sand-700',
    iconBackground: 'bg-ktip-sand-100',
  },
]

export default function AdminErrorSimulatorPage() {
  usePageTitle('Error Simulator')
  const toast = useToast()
  const [lastEvent, setLastEvent] = useState<{ title: string; eventId?: string } | null>(null)

  const trigger = (scenario: ErrorScenario) => {
    // Message comes from the shared registry, so the simulator cannot drift from
    // what production reports for this code.
    const eventId = captureSimulatedError({
      ...scenario,
      message: SAFE_MESSAGES[scenario.errorCode],
    })
    setLastEvent({ title: scenario.title, eventId })
    toast.success(
      eventId
        ? `${scenario.title} sent to Sentry (${eventId.slice(0, 8)})`
        : `${scenario.title} not sent — Sentry is not configured`
    )
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Monitoring"
        title="Error Simulator"
        subtitle="Send controlled, privacy-safe failures through the live monitoring pipeline."
        imageSeed="admin-error-simulator"
      />

      <div className="mb-6 rounded-xl border border-ktip-sun-200 bg-ktip-sun-50 px-5 py-4">
        <p className="font-semibold text-ktip-sun-900">These events are real</p>
        <p className="mt-1 text-sm text-ktip-sun-800">
          Each click sends one intentional event to the project's live Sentry environment and it will
          appear under Errors. Every event is tagged <code className="font-mono">simulated: true</code>{' '}
          and grouped separately from genuine issues, so triage them there when you are done.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((scenario) => {
          const Icon = scenario.icon
          return (
            <Card key={scenario.errorCode} className="flex h-full flex-col">
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${scenario.iconBackground}`}
              >
                <Icon size={23} className={scenario.iconClass} />
              </div>
              <h2 className="font-display text-lg font-bold text-ktip-sand-900">{scenario.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ktip-sand-600">
                {scenario.description}
              </p>
              <dl className="my-5 space-y-2 border-y border-ktip-sand-100 py-4 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ktip-sand-500">Area</dt>
                  <dd className="font-mono font-medium text-ktip-sand-800">{scenario.area}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ktip-sand-500">Code</dt>
                  <dd className="truncate font-mono font-medium text-ktip-sand-800">
                    {scenario.errorCode}
                  </dd>
                </div>
              </dl>
              <Button
                fullWidth
                variant={scenario.level === 'error' ? 'danger' : 'primary'}
                onClick={() => trigger(scenario)}
              >
                Send test event
              </Button>
            </Card>
          )
        })}
      </div>

      {lastEvent && (
        <div className="mt-8 rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50 px-5 py-4 text-sm text-ktip-ocean-900">
          <span className="font-semibold">Last event:</span> {lastEvent.title}
          {lastEvent.eventId && <span className="ml-2 font-mono text-xs">{lastEvent.eventId}</span>}
        </div>
      )}
    </>
  )
}
