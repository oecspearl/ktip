import { createClient } from '@supabase/supabase-js'
import {
  PARTNER_EMPLOYER_SELECT,
  PARTNER_WINDOW_SELECT,
  isShareable,
  isTombstone,
  toPartnerEmployer,
  toRemovedEmployer,
  type PartnerEmployerRow,
  type PartnerWindowRow,
} from '../../../src/lib/partner-payload'

export const config = { runtime: 'edge' }

/**
 * Outbound feed of OECS-verified employers, for a partner platform to pull.
 *
 * Authenticated by a static API key hashed at rest (migration 059), not by a
 * user session — the caller is a machine, and none of the JWT plumbing the rest
 * of api/ uses applies. The key travels in `Authorization: Bearer`, so this is
 * a server-to-server endpoint: no CORS headers are emitted, deliberately. A
 * browser must never hold this credential.
 *
 * GET rather than the POST-only convention elsewhere in api/, because this is a
 * cacheable read with no side effect beyond its own audit row.
 *
 * Two gates decide what ships, and a row must pass both: OECS verified it as an
 * employer, and it consented to external sharing. Verification alone is not
 * consent — contact_email is real PII.
 *
 * The response is a change stream, not a snapshot. Rows that leave the feed
 * come back as tombstones under ?include_removed=true; without that a consumer
 * polling by updated_since can never learn about a revocation, because a
 * revoked row simply stops matching and is never mentioned again.
 */

const SCOPE = 'employers:read'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const KEY_RE = /^ktip_[a-z0-9]{12}_[A-Za-z0-9_-]{43}$/
const RATE_WINDOW_SECONDS = 3600
const RATE_LIMIT = 600

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Vercel's proxy overwrites all three, so none of them is client-controlled. */
function clientIp(request: Request): string {
  const raw =
    request.headers.get('x-real-ip') ||
    (request.headers.get('x-vercel-forwarded-for') || '').split(',')[0].trim() ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  if (!raw) return 'unknown'
  // Truncate IPv6 to the /64 — otherwise anyone with a /64 allocation rotates
  // addresses for free and the per-IP bucket is meaningless.
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':')
  return raw
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Cursor is (updated_at, id) — updated_at alone is not unique, and paginating
 * on a non-unique key drops or repeats rows that share a timestamp.
 */
function encodeCursor(row: { updated_at: string; id: string }): string {
  return btoa(`${row.updated_at}|${row.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeCursor(raw: string): { updatedAt: string; id: string } | null {
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
    const [updatedAt, id] = atob(padded).split('|')
    if (!updatedAt || !id || Number.isNaN(Date.parse(updatedAt))) return null
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null
    return { updatedAt, id }
  } catch {
    return null
  }
}

export default async function handler(request: Request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 503)
  }

  const authHeader = request.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)
  const key = authHeader.slice(7).trim()

  const admin = createClient(supabaseUrl, serviceKey)
  const ip = clientIp(request)

  const log = (status: number, clientId: string | null, count: number) =>
    admin
      .from('api_access_log')
      .insert({
        client_id: clientId,
        endpoint: '/api/partner/v1/employers',
        status,
        record_count: count,
        ip,
      })
      .then(
        () => undefined,
        // A failed audit write must not fail the request, but it must be visible.
        (e: unknown) => console.error('[partner/employers] audit write failed', e)
      )

  // Rate limit BEFORE the key lookup. Consuming the bucket first is what stops
  // the limiter from becoming an oracle: an attacker probing prefixes must not
  // be able to tell a real key from a fake one by which attempts get counted.
  // Keyed on the digest so the plaintext key never lands in a table.
  const keyHash = await sha256Hex(key)
  const { data: limit } = await admin.rpc('consume_auth_rate_limit', {
    p_bucket: `partner:key:${keyHash.slice(0, 32)}`,
    p_window_seconds: RATE_WINDOW_SECONDS,
    p_limit: RATE_LIMIT,
  })
  if (limit && (limit as any).allowed === false) {
    await log(429, null, 0)
    return json({ error: 'rate_limited', retry_after: (limit as any).retry_after }, 429)
  }

  if (!KEY_RE.test(key)) {
    await log(401, null, 0)
    return json({ error: 'unauthorized' }, 401)
  }

  const { data: authResult, error: authError } = await admin.rpc('authenticate_api_client', {
    p_prefix: key.slice(0, 17), // "ktip_" + 12
    p_hash: keyHash,
    p_scope: SCOPE,
  })
  if (authError) {
    console.error('[partner/employers] authenticate_api_client failed', authError.message)
    return json({ error: 'server_error' }, 500)
  }

  const auth = authResult as { ok: boolean; client_id?: string } | null
  if (!auth?.ok || !auth.client_id) {
    await log(401, null, 0)
    // One body for unknown key, wrong secret, revoked key and missing scope.
    return json({ error: 'unauthorized' }, 401)
  }
  const clientId = auth.client_id

  // ---- parameters -------------------------------------------------------
  const params = new URL(request.url).searchParams

  const limitParam = parseInt(params.get('limit') || '', 10)
  const pageSize = Math.min(Math.max(Number.isNaN(limitParam) ? DEFAULT_LIMIT : limitParam, 1), MAX_LIMIT)

  const updatedSinceRaw = params.get('updated_since')
  let updatedSince: string | null = null
  if (updatedSinceRaw) {
    const parsed = Date.parse(updatedSinceRaw)
    if (Number.isNaN(parsed)) {
      await log(400, clientId, 0)
      return json({ error: 'invalid_updated_since' }, 400)
    }
    updatedSince = new Date(parsed).toISOString()
  }

  const cursorRaw = params.get('cursor')
  let cursor: { updatedAt: string; id: string } | null = null
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw)
    if (!cursor) {
      await log(400, clientId, 0)
      return json({ error: 'invalid_cursor' }, 400)
    }
  }

  const includeRemoved = params.get('include_removed') === 'true'
  if (includeRemoved && !updatedSince) {
    // A tombstone is only meaningful relative to a previous sync. Without a
    // window this would walk every row that ever lost verification.
    await log(400, clientId, 0)
    return json({ error: 'include_removed_requires_updated_since' }, 400)
  }

  // ---- pass 1: decide which rows the caller may see (no PII) -------------
  let windowQuery = admin
    .from('employers')
    .select(PARTNER_WINDOW_SELECT)
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(pageSize + 1) // one extra row is how we detect has_more

  if (!includeRemoved) {
    windowQuery = windowQuery.eq('verification_status', 'verified').eq('share_externally', true)
  } else {
    // Everything that changed in the window; the partition below decides which
    // rows become records and which become tombstones.
    windowQuery = windowQuery.not('verified_at', 'is', null)
  }

  if (updatedSince) windowQuery = windowQuery.gte('updated_at', updatedSince)
  if (cursor) {
    windowQuery = windowQuery.or(
      `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`
    )
  }

  const { data: windowRows, error: windowError } = await windowQuery
  if (windowError) {
    console.error('[partner/employers] window query failed', windowError.message)
    await log(500, clientId, 0)
    return json({ error: 'server_error' }, 500)
  }

  const rows = (windowRows || []) as unknown as PartnerWindowRow[]
  const hasMore = rows.length > pageSize
  const page = hasMore ? rows.slice(0, pageSize) : rows

  // ---- pass 2: read the payload for qualifying rows only -----------------
  // Splitting the read in two is the point: contact details are never pulled
  // out of the database for a row that failed the gate above.
  const shareableIds = page.filter(isShareable).map((r) => r.id)

  const detailById = new Map<string, PartnerEmployerRow>()
  if (shareableIds.length > 0) {
    const { data: details, error: detailError } = await admin
      .from('employers')
      .select(PARTNER_EMPLOYER_SELECT)
      .in('id', shareableIds)

    if (detailError) {
      console.error('[partner/employers] detail query failed', detailError.message)
      await log(500, clientId, 0)
      return json({ error: 'server_error' }, 500)
    }
    for (const d of (details || []) as unknown as PartnerEmployerRow[]) detailById.set(d.id, d)
  }

  const data: unknown[] = []
  for (const row of page) {
    if (isShareable(row)) {
      const detail = detailById.get(row.id)
      if (detail) data.push(toPartnerEmployer(detail))
    } else if (includeRemoved && isTombstone(row)) {
      data.push(toRemovedEmployer(row))
    }
  }

  const last = page[page.length - 1]
  const nextCursor = hasMore && last ? encodeCursor(last) : null

  await log(200, clientId, data.length)

  return json({ data, next_cursor: nextCursor, has_more: hasMore }, 200)
}
