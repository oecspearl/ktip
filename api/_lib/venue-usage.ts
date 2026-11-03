import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { UsageAction } from './livekit-webhook'

/**
 * Server-side writes to the venue usage ledger (migration 193).
 *
 * Every function here uses the service role, because the ledger has no client
 * insert policy: the amounts must be what the server measured, not what a
 * browser said. The translation writer never throws: metering is bookkeeping,
 * and a failed write must never fail the translation it rides on.
 * applyUsageActions() does throw, so the webhook can answer 5xx and LiveKit
 * retries; the idempotency key stops a retry counting twice.
 */

/** Vercel's edge context. Absent under the Vite dev middleware. */
export interface EdgeContext {
  waitUntil?: (promise: Promise<unknown>) => void
}

/**
 * Run work after the response has gone. On Vercel the function is kept alive
 * until it settles; without a context (local dev) it simply runs unawaited.
 */
export function afterResponse(context: EdgeContext | undefined, work: Promise<unknown>): void {
  const safe = work.catch((err) => console.error('[venue-usage] write failed', err))
  if (context?.waitUntil) context.waitUntil(safe)
}

export function serviceClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Which venue surface asked for a translation. */
export type TranslationSurface = 'chat' | 'captions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The venue context a translate request may carry, validated. Anything
 * malformed is null, and the request is then simply not metered.
 */
export function parseTranslationContext(
  raw: unknown
): { surface: TranslationSurface; roomId: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const { s, r } = raw as { s?: unknown; r?: unknown }
  if (s !== 'chat' && s !== 'captions') return null
  if (typeof r !== 'string' || !UUID.test(r)) return null
  return { surface: s, roomId: r }
}

/**
 * Record characters sent to the translation provider for a venue room.
 *
 * The caller's token is checked here, after the response, rather than before
 * the translation: proving who asked costs an auth round trip, and the reader
 * waiting for French should not pay it. record_venue_usage() then checks the
 * person belongs to the room's event, so a valid token cannot bill another
 * event's ledger.
 */
export async function recordTranslationUsage(args: {
  authHeader: string | null
  roomId: string
  surface: TranslationSurface
  chars: number
  to: string
  provider: string | null
}): Promise<void> {
  if (args.chars <= 0) return
  const token = args.authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return
  const db = serviceClient()
  if (!db) return

  const {
    data: { user },
  } = await db.auth.getUser(token)
  if (!user) return

  const { error } = await db.rpc('record_venue_usage', {
    p_room_id: args.roomId,
    p_user_id: user.id,
    p_kind: args.surface === 'captions' ? 'caption_chars' : 'translate_chars',
    p_amount: args.chars,
    p_meta: { surface: args.surface, to: args.to, provider: args.provider },
  })
  if (error) console.error('[venue-usage] translation record failed', error.message)
}

/** Apply what one LiveKit webhook means to the session table and the ledger. */
export async function applyUsageActions(db: SupabaseClient, actions: UsageAction[]): Promise<void> {
  for (const action of actions) {
    if (action.op === 'open') {
      const { error } = await db.rpc('open_venue_usage_session', {
        p_room_id: action.roomId,
        p_user_id: action.userId,
        p_kind: action.kind,
        p_sid: action.sid,
        p_at: action.at,
      })
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db.rpc('close_venue_usage_session', {
        p_room_id: action.roomId,
        p_user_id: action.userId,
        p_kind: action.kind,
        p_sid: action.sid,
        p_at: action.at,
        p_started_at: action.startedAt,
        p_source_id: action.sourceId,
      })
      if (error) throw new Error(error.message)
    }
  }
}
