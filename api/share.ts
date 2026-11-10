import {
  authenticate,
  adminClientOrNull,
  consumeRateLimit,
  requireVerified,
} from './_lib/require-permission'
import { clientIp } from './_lib/client-ip'
import {
  DRAFT_ANGLES,
  DRAFT_LANGS,
  DRAFT_PLATFORMS,
  SHARE_KINDS,
  buildDraftSystemPrompt,
  buildDraftUserPrompt,
  parseDraftLine,
  type DraftAngle,
  type DraftLang,
  type DraftPlatform,
  type ShareKind,
} from '../src/lib/share/draft-prompt'
import { lineBuffer } from '../src/lib/share/lines'
import { RECORD_BUILDERS, isShareable } from '../src/lib/share/records'
import { allowedNumbers, unmatchedIn } from '../src/lib/share/fact-check'

export const config = { runtime: 'edge' }

/**
 * POST /api/share — the AI messages in the share panel.
 *
 * Body: { kind, id, platforms, lang, angle?, avoid? }. One call writes every
 * style for every app the member picked. Regenerate sends one app, one
 * `angle`, and the text on screen as `avoid` so the new take reads
 * differently.
 *
 * The reply streams, one JSON event per line (application/x-ndjson), so the
 * panel fills in message by message instead of waiting for all eighteen:
 *   {"type":"start","allowed":[...]}   numbers the record contains, for
 *                                      re-checking edits in the browser
 *   {"type":"take","app","angle","text","unmatched":[...]}
 *                                      one message, with any numbers in it the
 *                                      record does not contain
 *   {"type":"end","count":n} or {"type":"error","error":"..."}
 * Apps come in the order the browser listed them, so it puts the one on
 * screen first. Problems found before the model starts (auth, limits, a
 * private item, OpenAI refusing) are still plain JSON errors with a status.
 *
 * The browser never supplies facts. This route loads the item itself with the
 * caller's own client, so row-level security has already decided the caller
 * may see it, refuses anything that isn't live and public (drafts, private
 * projects, suspended grants, unverified businesses), and passes the row
 * through an allow-list in src/lib/share/records.ts before the model sees
 * any of it. A member can't get the model to write about something they can't
 * open, or feed it facts the item doesn't have.
 *
 * Signed-in members only, throttled per member like api/ai-chat.ts: drafts
 * are paid calls on OPENAI_API_KEY, straight to OpenAI (not OpenRouter).
 * GPT-4.1 by default: side by side on the same prompt it kept to the voice
 * rules and wrote sharper hooks than GPT-4o, which kept slipping into stock
 * lines, and it costs less. OPENAI_SHARE_MODEL changes it without a deploy.
 *
 * Later steps add GET handling here for link-preview bots and the card image,
 * so the feature stays one function.
 */

const BURST_LIMIT = 12
const BURST_WINDOW = 900
const DAILY_LIMIT = 60
const DAILY_WINDOW = 86_400

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/

const TABLE: Record<Exclude<ShareKind, 'org'>, string> = {
  event: 'events',
  grant: 'grants',
  project: 'projects',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'AI drafting is not configured' }, 503)

  const guard = await authenticate(request)
  if (!guard.ok) return guard.response
  const { callerId, callerClient } = guard

  // 205: an unverified account browses; it does not spend the AI budget. The
  // same gate ai-chat and extract-fields apply.
  const unverified = await requireVerified(callerClient)
  if (unverified) return unverified

  // Fail closed, as api/ai-chat.ts does: no service key means no throttle, and
  // an unthrottled route onto a paid key is not something to ship.
  const adminClient = adminClientOrNull()
  if (!adminClient) return json({ error: 'Server configuration error' }, 503)

  const [burst, daily] = await Promise.all([
    consumeRateLimit(adminClient, `share-draft:user:${callerId}`, BURST_WINDOW, BURST_LIMIT),
    consumeRateLimit(
      adminClient,
      `share-draft:user-daily:${callerId}:${clientIp(request)}`,
      DAILY_WINDOW,
      DAILY_LIMIT
    ),
  ])
  if (!burst || !daily) {
    return json({ error: 'rate_limited' }, 429)
  }

  let body: { kind?: unknown; id?: unknown; platforms?: unknown; lang?: unknown; angle?: unknown; avoid?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const kind = body.kind as ShareKind
  // The browser's order, so the app on screen is written first.
  const platforms = [
    ...new Set(
      (Array.isArray(body.platforms) ? body.platforms : []).filter((p): p is DraftPlatform =>
        (DRAFT_PLATFORMS as readonly unknown[]).includes(p)
      )
    ),
  ]
  const angle = (DRAFT_ANGLES as readonly string[]).includes(String(body.angle)) ? (body.angle as DraftAngle) : null
  const avoid = angle && typeof body.avoid === 'string' ? body.avoid : undefined
  const lang = (DRAFT_LANGS as readonly string[]).includes(String(body.lang)) ? (body.lang as DraftLang) : 'en'
  const id = typeof body.id === 'string' ? body.id : ''
  if (!(SHARE_KINDS as readonly string[]).includes(kind)) return json({ error: 'Unknown kind' }, 400)
  if (platforms.length === 0) return json({ error: 'No apps' }, 400)
  if (kind === 'org' ? !SLUG.test(id) : !UUID.test(id)) return json({ error: 'Invalid id' }, 400)

  // Load as the caller: RLS (and public_employer's verified-only rule) decide visibility.
  let row: Record<string, unknown> | null = null
  if (kind === 'org') {
    const { data, error } = await callerClient.rpc('public_employer', { p_slug: id })
    if (error) return json({ error: 'Could not load the item' }, 502)
    row = ((data as Record<string, unknown>[] | null) || [])[0] ?? null
  } else {
    const { data, error } = await callerClient.from(TABLE[kind]).select('*').eq('id', id).maybeSingle()
    if (error) return json({ error: 'Could not load the item' }, 502)
    row = (data as Record<string, unknown> | null) ?? null
  }
  if (!row || !isShareable(kind, row)) return json({ error: 'not_shareable' }, 404)

  const record = RECORD_BUILDERS[kind](row)
  const model = process.env.OPENAI_SHARE_MODEL || 'gpt-4.1'

  const angles = angle ? [angle] : [...DRAFT_ANGLES]
  const controller = new AbortController()
  // Eighteen long messages take well over a minute; they stream in meanwhile.
  const timeout = setTimeout(() => controller.abort(), 150_000)
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        stream: true,
        // Up to about 300 tokens a take (LinkedIn's are longest); six apps by three styles is the most one call asks for.
        max_tokens: Math.min(8000, 400 + platforms.length * angles.length * 380),
        messages: [
          { role: 'system', content: buildDraftSystemPrompt({ kind, platforms, lang, angles, avoid }) },
          { role: 'user', content: buildDraftUserPrompt(record) },
        ],
      }),
      signal: controller.signal,
    })
  } catch {
    clearTimeout(timeout)
    return json({ error: 'ai_unavailable' }, 502)
  }
  if (!res.ok || !res.body) {
    clearTimeout(timeout)
    const detail = await res.text().catch(() => '')
    console.error('[share] OpenAI error', res.status, detail.slice(0, 300))
    return json({ error: 'ai_unavailable' }, 502)
  }

  const allowed = allowedNumbers(record)
  const upstream = res.body
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(out) {
      const send = (event: unknown) => out.enqueue(encoder.encode(`${JSON.stringify(event)}
`))
      const seen = new Set<string>()
      const take = (line: string) => {
        const parsed = parseDraftLine(line, platforms, angles)
        if (!parsed || seen.has(`${parsed.platform}/${parsed.angle}`)) return
        seen.add(`${parsed.platform}/${parsed.angle}`)
        send({
          type: 'take',
          app: parsed.platform,
          angle: parsed.angle,
          text: parsed.text,
          unmatched: unmatchedIn(parsed.text, allowed),
        })
      }

      send({ type: 'start', allowed, model })
      // OpenAI sends server-sent events; each carries a few characters of the reply.
      const events = lineBuffer()
      const reply = lineBuffer()
      const reader = upstream.getReader()
      const decoder = new TextDecoder()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          for (const event of events.push(decoder.decode(value, { stream: true }))) {
            if (!event.startsWith('data:')) continue
            const data = event.slice(5).trim()
            if (data === '[DONE]') continue
            try {
              const delta = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta
                ?.content
              if (delta) reply.push(delta).forEach(take)
            } catch {
              // A malformed event loses a few characters; the line it belonged to fails to parse and is skipped.
            }
          }
        }
        reply.flush().forEach(take)
        send(seen.size ? { type: 'end', count: seen.size } : { type: 'error', error: 'ai_bad_reply' })
      } catch {
        send({ type: 'error', error: 'ai_unavailable' })
      } finally {
        clearTimeout(timeout)
        out.close()
      }
    },
    cancel() {
      // The member closed the panel or changed language: stop paying for the rest.
      controller.abort()
      clearTimeout(timeout)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
