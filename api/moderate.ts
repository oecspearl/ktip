import { requirePermission } from './_lib/require-permission'

export const config = { runtime: 'edge' }

/**
 * Advisory second opinion on a queued moderation item.
 *
 * Deliberately NOT in the write path. Content is classified by a deterministic
 * Postgres trigger before the row lands, because `messages` is realtime-
 * published and anything decided after the insert has already been delivered.
 * This route only annotates an existing report for a human reviewer — it never
 * changes what is visible, and a failure here costs nothing.
 *
 * There is no cron or queue in this project, so it runs on request only:
 * a reviewer presses "Ask for review" in /admin/moderation.
 */

const MODEL = 'gpt-4o-mini'
const TIMEOUT_MS = 20_000

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const SYSTEM_PROMPT = `You are a content-safety reviewer for a Caribbean education and innovation platform used by school-verified students as well as adults.

Classify the content into exactly one severity:
- "low": mild vulgarity, spam, or a minor guideline breach.
- "medium": harassment, hate speech, sexual content, or exposed personal information.
- "high": grooming behaviour toward a minor, threats of harm, or severe targeted abuse.
- "none": nothing actionable; the automated filter was over-eager.

Respond with strict JSON only: {"severity": "...", "rationale": "one sentence"}.
Be conservative about "high" — it triggers an account suspension and a report to the member's school.`

export default async function handler(request: Request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const guard = await requirePermission(request, 'moderation:view')
  if (!guard.ok) return guard.response
  const { adminClient } = guard

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'Moderation review is not configured' }, 503)

  let body: { report_id?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.report_id) return json({ error: 'report_id is required' }, 400)

  const { data: report, error } = await adminClient
    .from('content_reports')
    .select('id, category, detail, content_snapshot, target_type, target_id, target_author_id')
    .eq('id', body.report_id)
    .single()

  if (error || !report) return json({ error: 'Report not found' }, 404)

  const snapshot = (report as any).content_snapshot
  if (!snapshot) return json({ severity: null, rationale: 'No content was captured for this report.' }, 200)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Reported as: ${(report as any).category}\nSurface: ${(report as any).target_type}\nReporter note: ${(report as any).detail || '(none)'}\n\nContent:\n${String(snapshot).slice(0, 4000)}`,
          },
        ],
      }),
    })

    if (!completion.ok) {
      return json({ severity: null, rationale: 'Review service unavailable.' }, 200)
    }

    const payload = await completion.json()
    const raw = payload?.choices?.[0]?.message?.content ?? '{}'

    let verdict: { severity?: string; rationale?: string }
    try {
      verdict = JSON.parse(raw)
    } catch {
      return json({ severity: null, rationale: 'Review returned an unreadable response.' }, 200)
    }

    const severity = ['low', 'medium', 'high'].includes(String(verdict.severity))
      ? String(verdict.severity)
      : null

    // Recorded as an advisory note, never as a status change.
    await adminClient.from('moderation_log').insert({
      actor_kind: 'system',
      user_id: (report as any).target_author_id,
      target_type: (report as any).target_type,
      target_id: (report as any).target_id,
      severity,
      action: 'flagged',
      detail: {
        source: 'llm_review',
        report_id: (report as any).id,
        severity,
        rationale: verdict.rationale ?? null,
      },
    } as any)

    return json({ severity, rationale: verdict.rationale ?? 'No rationale provided.' }, 200)
  } catch (err: any) {
    const aborted = err?.name === 'AbortError'
    return json(
      { severity: null, rationale: aborted ? 'Review timed out.' : 'Review failed.' },
      200
    )
  } finally {
    clearTimeout(timeout)
  }
}
