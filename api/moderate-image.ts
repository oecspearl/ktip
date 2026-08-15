import { authenticate, adminClientOrNull } from './_lib/require-permission'
import { getModerationProvider } from './_lib/moderation-provider'

export const config = { runtime: 'edge' }

/**
 * Safety check for an image a member has just uploaded, before it is attached
 * to anything.
 *
 * The request names a BUCKET AND KEY, never a URL. Accepting a caller-supplied
 * URL would turn this route into an SSRF primitive: it runs on the edge
 * network with a service-role key, and "fetch this address for me" is exactly
 * the capability an attacker wants from it.
 *
 * Ownership is then checked through the CALLER's client, so RLS answers the
 * question rather than this file re-implementing it. Without that, any member
 * could ask about any key in a private conversation's folder and learn what is
 * in someone else's DMs from the verdict alone.
 *
 * Fails open, like the text check, with one exception spelled out below.
 */

const TIMEOUT_MS = 8_000

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const allow = (degraded: string) =>
  json({ severity: null, categories: [], reason: null, degraded }, 200)

/**
 * How the bytes reach the model, per bucket.
 *
 * `inline` sends base64 in the request body. `signed` hands over a short-lived
 * URL. The split is a privacy decision, not a performance one: an image in a
 * direct message may involve a school-verified minor, and giving a third-party
 * vendor a fetchable URL to it — one that lands in their request logs — is a
 * materially different posture from sending the bytes inside a POST. The
 * public buckets are already world-readable, so the URL costs nothing there.
 */
const BUCKETS: Record<string, { transport: 'inline' | 'signed' }> = {
  'message-attachments': { transport: 'inline' },
  avatars: { transport: 'signed' },
  'project-images': { transport: 'signed' },
  'event-images': { transport: 'signed' },
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await authenticate(request)
  if (!guard.ok) return guard.response
  const { callerId, callerClient } = guard

  let body: { bucket?: string; path?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const bucket = String(body.bucket ?? '')
  const path = String(body.path ?? '')
  const rules = BUCKETS[bucket]

  if (!rules || !path || path.includes('..')) {
    return json({ error: 'Unsupported bucket or path' }, 400)
  }

  const owner = path.split('/')[0]

  if (bucket === 'message-attachments') {
    // Key layout is {conversationId}/{senderId}/… (095). Asked through the
    // caller's own client, so a non-participant simply gets no row.
    const { data: participation } = await callerClient
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', owner)
      .eq('user_id', callerId)
      .maybeSingle()

    if (!participation) return json({ error: 'Forbidden' }, 403)
  } else if (owner !== callerId) {
    return json({ error: 'Forbidden' }, 403)
  }

  const provider = getModerationProvider()
  const adminClient = adminClientOrNull()
  if (!provider || !adminClient) return allow('no_key')

  const { data: claim } = await adminClient.rpc('claim_moderation_check_budget', {
    p_user: callerId,
    p_chars: 0,
    p_images: 1,
  })
  if (claim && (claim as any).allowed === false) return allow('rate_limited')

  const { data: signed } = await adminClient.storage.from(bucket).createSignedUrl(path, 120)
  if (!signed?.signedUrl) return allow('unreadable')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let image: { url: string } | { dataUrl: string }

    if (rules.transport === 'inline') {
      const blob = await fetch(signed.signedUrl, { signal: controller.signal })
      if (!blob.ok) return allow('unreadable')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const mime = blob.headers.get('content-type') || 'image/jpeg'
      image = { dataUrl: `data:${mime};base64,${btoa(binary)}` }
    } else {
      image = { url: signed.signedUrl }
    }

    const verdict = await provider.classifyImage(image, controller.signal)

    if (verdict.severity === 'medium' || verdict.severity === 'high') {
      await adminClient.from('moderation_log').insert({
        actor_kind: 'system',
        user_id: callerId,
        target_type: 'image',
        target_id: null,
        severity: verdict.severity,
        action: verdict.categories.includes('csam_risk') ? 'escalated' : 'flagged',
        detail: {
          source: 'image_gate',
          bucket,
          path,
          categories: verdict.categories,
          reason: verdict.reason,
          provider: provider.id,
        },
      } as any)

      // The one thing that is never merely logged. escalate_to_safety() reaches
      // the safety team and, for a school-verified student, their institution.
      if (verdict.severity === 'high' && verdict.categories.includes('csam_risk')) {
        await adminClient.rpc('escalate_to_safety', {
          p_user: callerId,
          p_target_type: 'image',
          p_target_id: null,
          p_severity: 'high',
        })
      }
    }

    return json(
      {
        severity: verdict.severity === 'none' ? null : verdict.severity,
        categories: verdict.categories,
        reason: verdict.reason,
      },
      200
    )
  } catch (err: any) {
    // Failing open on images means some unsafe ones land during an outage, so
    // unlike the text check the misses are recorded for a later sweep.
    await adminClient
      .from('moderation_image_backlog')
      .insert({ bucket, path, user_id: callerId, reason: err?.name ?? 'error' } as any)
      .then(
        () => undefined,
        () => undefined
      )
    return allow(err?.name === 'AbortError' ? 'timeout' : 'provider_error')
  } finally {
    clearTimeout(timeout)
  }
}
