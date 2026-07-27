import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

export type AIAction = 'improve_field' | 'suggest_section' | 'review_proposal' | 'adjust_tone'

export interface AIReviewResult {
  score: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`AI error: ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`)
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

export function useAISuggestions() {
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async ({
      action,
      context,
    }: {
      action: AIAction
      context: Record<string, any>
    }): Promise<any> => {
      let systemPrompt: string
      let userPrompt: string

      switch (action) {
        case 'improve_field':
          ;[systemPrompt, userPrompt] = buildImproveFieldPrompt(context)
          break
        case 'suggest_section':
          ;[systemPrompt, userPrompt] = buildSuggestSectionPrompt(context)
          break
        case 'review_proposal':
          ;[systemPrompt, userPrompt] = buildReviewPrompt(context)
          break
        case 'adjust_tone':
          ;[systemPrompt, userPrompt] = buildAdjustTonePrompt(context)
          break
        default:
          throw new Error(`Unknown action: ${action}`)
      }

      const result = await callOpenAI(systemPrompt, userPrompt)

      if (action === 'review_proposal') {
        try {
          return JSON.parse(result)
        } catch {
          return { score: 0, summary: result, strengths: [], weaknesses: [], suggestions: [] }
        }
      }

      return { html: result }
    },
  })

  const invoke = async (action: AIAction, context: Record<string, any>): Promise<any> => {
    setError(null)
    try {
      return await mutation.mutateAsync({ action, context })
    } catch (err: any) {
      setError(err.message || 'AI suggestion failed')
      return null
    }
  }

  const improveField = async (context: {
    proposalType: string
    fieldLabel: string
    fieldValue: string
    helpText?: string
  }): Promise<string | null> => {
    const result = await invoke('improve_field', context)
    return result?.html || null
  }

  const suggestSection = async (context: {
    proposalType: string
    fieldLabel: string
    helpText?: string
    placeholder?: string
    proposalTitle?: string
    existingData?: Record<string, any>
  }): Promise<string | null> => {
    const result = await invoke('suggest_section', context)
    return result?.html || null
  }

  const reviewProposal = async (context: {
    proposalType: string
    proposalTitle: string
    proposalData: Record<string, any>
  }): Promise<AIReviewResult | null> => {
    const result = await invoke('review_proposal', context)
    return result as AIReviewResult | null
  }

  const adjustTone = async (context: {
    fieldValue: string
    tone: string
  }): Promise<string | null> => {
    const result = await invoke('adjust_tone', context)
    return result?.html || null
  }

  return { improveField, suggestSection, reviewProposal, adjustTone, loading: mutation.isPending, error }
}
