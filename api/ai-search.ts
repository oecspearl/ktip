import { SITE_MAP_COMPACT, SITE_ENTRY_IDS } from '../src/lib/site-map'

export const config = { runtime: 'edge' }

const MODEL = 'gpt-4o-mini'
const MAX_QUERY_CHARS = 300
const MAX_IDS = 6

/**
 * AI-guided navigation for the navbar search panel.
 *
 * The site map lives server-side (imported from src/lib/site-map.ts) so the
 * ~1.7k-token index never crosses the wire on every keystroke. It is also the
 * first thing in the system prompt, which keeps the prefix identical between
 * requests so OpenAI's automatic prompt caching applies.
 *
 * Request:  { query: string, signedIn?: boolean, isOecs?: boolean }
 * Response: { ids: string[], answer: string, steps: string[] }
 */

const INSTRUCTIONS = `You are the navigator for KTIP (Knowledge, Technology and Innovation Platform), an OECS Caribbean innovation platform. You help users find the page, feature or action they are describing, even when they do not know what it is called.

Below is the complete site map. Each line is:
id|title|category|description[|access]
"access" appears only when the entry is restricted: guest = signed-out only, auth = signed-in only, oecs = OECS administrators only.

Reply with JSON only, in this exact shape:
{"ids": ["<site map id>", ...], "answer": "<2-3 sentences>", "steps": ["<step>", ...]}

Rules:
- "ids" holds at most ${MAX_IDS} ids, most relevant first, copied verbatim from the site map. Never invent an id.
- Prefer entries the user can actually reach given their sign-in state, but do mention signing up or logging in when that is the real answer.
- "answer" is plain, warm, jargon-free language telling them where to go and what they will find.
- "steps" is optional: 2-4 short click-by-click instructions, only when doing the thing is not obvious from the destination alone.
- If nothing in the map fits, return an empty "ids" array and say so honestly in "answer".
- Only answer questions about KTIP. For anything else, return empty "ids" and briefly redirect.

SITE MAP:
${SITE_MAP_COMPACT}`

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return json({ error: 'AI service is not configured' }, 503)
  }

  let body: { query?: string; signedIn?: boolean; isOecs?: boolean }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_CHARS) : ''
  if (!query) {
    return json({ error: 'query is required' }, 400)
  }

  const viewer = body.isOecs
    ? 'The user is signed in as an OECS administrator.'
    : body.signedIn
      ? 'The user is signed in as a regular member.'
      : 'The user is NOT signed in.'

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
        // The long, stable system prompt goes first so it can be cached.
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content: `${viewer}\n\nThey typed: ${query}` },
        ],
        temperature: 0.2,
        max_tokens: 400,
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

    let parsed: { ids?: unknown; answer?: unknown; steps?: unknown } = {}
    try {
      parsed = JSON.parse(content ?? '{}')
    } catch {
      // Model returned prose despite json_object mode — degrade, do not fail
      return json({ ids: [], answer: typeof content === 'string' ? content.slice(0, 600) : '', steps: [] }, 200)
    }

    // Drop anything the model invented, so the client can trust every id
    const ids = Array.isArray(parsed.ids)
      ? parsed.ids
          .filter((id): id is string => typeof id === 'string' && SITE_ENTRY_IDS.has(id))
          .slice(0, MAX_IDS)
      : []

    const answer = typeof parsed.answer === 'string' ? parsed.answer.slice(0, 800) : ''

    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.filter((s): s is string => typeof s === 'string').slice(0, 5)
      : []

    return json({ ids, answer, steps }, 200)
  } catch {
    return json({ error: 'Failed to reach AI service' }, 502)
  }
}
