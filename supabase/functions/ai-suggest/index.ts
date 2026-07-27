import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const MODEL = 'gpt-4o-mini'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  action: 'improve_field' | 'suggest_section' | 'review_proposal' | 'adjust_tone'
  context: Record<string, any>
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content
}

function buildImproveFieldPrompt(context: Record<string, any>): [string, string] {
  const system = `You are an expert proposal writer helping improve a specific field in a ${context.proposalType} proposal.
Return ONLY the improved HTML content — no explanations, no markdown code fences.
Use <p>, <strong>, <em>, <ul>/<li>, <ol>/<li>, and <h3> tags as appropriate.
Maintain the original intent but make it more compelling, clear, and professional.`

  const user = `Field: "${context.fieldLabel}"
Current content:
${context.fieldValue}

${context.helpText ? `Guidance: ${context.helpText}` : ''}
Improve this content to be more professional, specific, and compelling.`

  return [system, user]
}

function buildSuggestSectionPrompt(context: Record<string, any>): [string, string] {
  const system = `You are an expert proposal writer. Generate content for a specific section of a ${context.proposalType} proposal.
Return ONLY HTML content — no explanations, no markdown code fences.
Use <p>, <strong>, <em>, <ul>/<li>, <ol>/<li>, and <h3> tags as appropriate.
Generate professional, specific, and compelling content.`

  const user = `Section: "${context.fieldLabel}"
${context.helpText ? `Guidance: ${context.helpText}` : ''}
${context.placeholder ? `Hints: ${context.placeholder}` : ''}

Proposal title: ${context.proposalTitle || 'Untitled'}
${context.existingData ? `Other sections already written:\n${JSON.stringify(context.existingData, null, 2)}` : ''}

Generate appropriate content for this section.`

  return [system, user]
}

function buildReviewPrompt(context: Record<string, any>): [string, string] {
  const system = `You are an expert proposal reviewer evaluating a ${context.proposalType} proposal.
Return a JSON object (no markdown fences) with this exact structure:
{
  "score": <number 1-100>,
  "summary": "<one paragraph overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>", ...]
}
Be specific, constructive, and actionable. Score fairly based on completeness, clarity, and persuasiveness.`

  const user = `Proposal Title: ${context.proposalTitle}
Type: ${context.proposalType}

Proposal Data:
${JSON.stringify(context.proposalData, null, 2)}`

  return [system, user]
}

function buildAdjustTonePrompt(context: Record<string, any>): [string, string] {
  const tone = context.tone || 'professional'
  const system = `You are an expert editor. Rewrite the given content with a ${tone} tone.
Return ONLY the rewritten HTML content — no explanations, no markdown code fences.
Use <p>, <strong>, <em>, <ul>/<li>, <ol>/<li>, and <h3> tags as appropriate.
Preserve all factual content and key points while adjusting the tone.`

  const user = `Rewrite the following with a "${tone}" tone:

${context.fieldValue}`

  return [system, user]
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    const { action, context } = await req.json() as RequestBody

    let systemPrompt: string
    let userPrompt: string

    switch (action) {
      case 'improve_field':
        [systemPrompt, userPrompt] = buildImproveFieldPrompt(context)
        break
      case 'suggest_section':
        [systemPrompt, userPrompt] = buildSuggestSectionPrompt(context)
        break
      case 'review_proposal':
        [systemPrompt, userPrompt] = buildReviewPrompt(context)
        break
      case 'adjust_tone':
        [systemPrompt, userPrompt] = buildAdjustTonePrompt(context)
        break
      default:
        throw new Error(`Unknown action: ${action}`)
    }

    const result = await callOpenAI(systemPrompt, userPrompt)

    // For review_proposal, parse the JSON
    let responseData: any
    if (action === 'review_proposal') {
      try {
        responseData = JSON.parse(result)
      } catch {
        // If JSON parsing fails, wrap it
        responseData = { score: 0, summary: result, strengths: [], weaknesses: [], suggestions: [] }
      }
    } else {
      responseData = { html: result }
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
