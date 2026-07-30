import { createClient } from '@supabase/supabase-js'
import { FIELD_SPECS, describeFields, sanitizeFields } from '../src/lib/extracted-fields'

export const config = { runtime: 'edge' }

const MODEL = 'gpt-4o-mini'
const MAX_MARKDOWN_CHARS = 12_000

/**
 * Proposes values for a grant's or project's structured columns from the text
 * scraped out of an uploaded document.
 *
 * Two things this endpoint deliberately does that /api/ai-search does not:
 *
 *  1. It requires a signed-in caller. ai-chat and ai-search are open because
 *     their input is a short search box; this one accepts pages of free text
 *     and would otherwise be an unmetered pipe to the OpenAI key.
 *
 *  2. It whitelists the model's output against the shared field spec in
 *     src/lib/extracted-fields.ts — unknown keys, wrong types and out-of-enum
 *     values are dropped server-side, the same way ai-search drops ids that are
 *     not in the site map. Nothing here writes to the database; the client
 *     shows the proposals for per-field review.
 *
 * Request:  { entityType: 'grant' | 'project', markdown: string }
 * Response: { fields: { <column>: { value, confidence, evidence } } }
 */

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function buildInstructions(entityType: string, fieldList: string): string {
  return `You read funding and project documents and pull out structured data. The user gives you the text of one document. Extract only what the document actually states about a single ${entityType}.

Reply with JSON only, in this exact shape:
{"fields": {"<field name>": {"value": <value>, "confidence": <0-1>, "evidence": "<short quote from the document>"}}}

Fields you may return:
${fieldList}

Rules:
- Omit any field the document does not state. Never guess, never infer from the file name, never carry a value over from another field.
- "evidence" must be a short verbatim quote from the document that supports the value. If you cannot quote it, omit the field.
- "confidence" is how sure you are the value is stated in the document: 0.9+ when quoted outright, 0.5-0.7 when it needs interpretation.
- Amounts are plain numbers with no currency symbols, commas or words.
- Dates are YYYY-MM-DD. If only a month and year appear, omit the field.
- Return {"fields": {}} if the document is not about a ${entityType}.`
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return json({ error: 'AI service is not configured' }, 503)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Server configuration error' }, 503)
  }

  // Signed-in callers only — see the note at the top of this file
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()
  if (!caller) {
    return json({ error: 'Unauthorized' }, 401)
  }

  let body: { entityType?: string; markdown?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const entityType = typeof body.entityType === 'string' ? body.entityType : ''
  const spec = FIELD_SPECS[entityType]
  if (!spec) {
    return json({ error: 'Unsupported entityType' }, 400)
  }

  const markdown =
    typeof body.markdown === 'string' ? body.markdown.trim().slice(0, MAX_MARKDOWN_CHARS) : ''
  if (!markdown) {
    return json({ error: 'markdown is required' }, 400)
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        // The long, stable field spec goes first so it can be cached
        messages: [
          { role: 'system', content: buildInstructions(entityType, describeFields(spec)) },
          { role: 'user', content: `Document text:\n\n${markdown}` },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json({ error: `AI error: ${res.status}`, detail: detail.slice(0, 200) }, res.status)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content

    let parsed: { fields?: unknown } = {}
    try {
      parsed = JSON.parse(content ?? '{}')
    } catch {
      // Model returned prose despite json_object mode — degrade, do not fail
      return json({ fields: {} }, 200)
    }

    return json({ fields: sanitizeFields(spec, parsed.fields) }, 200)
  } catch {
    return json({ error: 'Failed to reach AI service' }, 502)
  }
}
