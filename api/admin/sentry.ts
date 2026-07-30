import { authorize } from '../_lib/require-permission'
import { withApiMonitoring } from '../_monitoring'
import {
  handleSentryDashboardRequest,
  handleSentryMutation,
  isSentryConfigError,
  resolveSentryApiConfig,
} from '../_sentry-api'

export const config = { runtime: 'edge' }

/**
 * Server-side proxy for the admin error dashboard.
 *
 * The Sentry auth token is an organisation-wide credential, so it never reaches
 * the browser: the client asks this route, this route asks Sentry. Access is
 * gated on `org:manage` through the same has_permission() function RLS uses, so
 * revoking an admin in the matrix revokes their access to the error stream too.
 *
 * Unlike the other api/admin routes this one takes no service-role client — it
 * reads nothing from Postgres beyond the caller's own permission check.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Error data is privileged and changes constantly; a shared cache holding
      // one admin's issue list would be wrong on both counts.
      'Cache-Control': 'no-store',
    },
  })

async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const guard = await authorize(request, 'org:manage')
  if (!guard.ok) return guard.response

  const sentryConfig = resolveSentryApiConfig(process.env)
  if (isSentryConfigError(sentryConfig)) {
    // 501, not 500: the deployment is healthy, the operator simply has not
    // wired the token up yet. The dashboard renders setup guidance for this.
    return json(sentryConfig, 501)
  }

  if (request.method === 'POST') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }
    const result = await handleSentryMutation(body, sentryConfig)
    return json(result.body, result.status)
  }

  const result = await handleSentryDashboardRequest(new URL(request.url), sentryConfig)
  return json(result.body, result.status)
}

export default withApiMonitoring('admin/sentry', handler)
