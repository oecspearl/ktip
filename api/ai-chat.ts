export const config = { runtime: 'edge' }

const ALLOWED_MODELS = ['gpt-4o-mini']

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'AI service is not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: {
    messages: { role: string; content: string }[]
    temperature?: number
    max_tokens?: number
    model?: string
  }

  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'messages array is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const model = ALLOWED_MODELS.includes(body.model || '') ? body.model : 'gpt-4o-mini'
  const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 2) : 0.7
  const max_tokens = typeof body.max_tokens === 'number' ? Math.min(body.max_tokens, 4000) : 1000

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
        model,
        messages: body.messages,
        temperature,
        max_tokens,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      return new Response(
        JSON.stringify({ error: `AI error: ${res.status}`, detail: errorText.slice(0, 200) }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Failed to reach AI service' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
