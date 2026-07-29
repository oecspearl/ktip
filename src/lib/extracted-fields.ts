/**
 * The contract between the document scraper and the entities it can fill in.
 *
 * Lives in src/lib rather than api/ so the edge function, the review panel and
 * the tests all read one definition — the same arrangement api/ai-search.ts has
 * with site-map.ts. Nothing here is React- or Node-specific.
 */

export type FieldKind = 'string' | 'number' | 'boolean' | 'date' | 'url' | 'enum' | 'string[]'

export interface FieldSpec {
  kind: FieldKind
  /** Shown to the model as the field's instruction. */
  describe: string
  values?: string[]
  maxLength?: number
  /** Shown to the user in the review panel. */
  label: string
}

// grant_type values come from the CHECK constraint in migration 003
export const GRANT_TYPES = ['startup', 'research', 'innovation', 'development', 'education']

export const FIELD_SPECS: Record<string, Record<string, FieldSpec>> = {
  grant: {
    title: {
      kind: 'string',
      label: 'Title',
      describe: 'Official name of the grant or funding call',
      maxLength: 200,
    },
    summary: {
      kind: 'string',
      label: 'Summary',
      describe: 'One-sentence summary, max 200 characters',
      maxLength: 300,
    },
    description: {
      kind: 'string',
      label: 'Description',
      describe: 'Two to four paragraphs describing the grant',
      maxLength: 4000,
    },
    amount_min: {
      kind: 'number',
      label: 'Minimum award',
      describe: 'Smallest award amount as a plain number',
    },
    amount_max: {
      kind: 'number',
      label: 'Maximum award',
      describe: 'Largest award amount as a plain number',
    },
    currency: {
      kind: 'string',
      label: 'Currency',
      describe: 'ISO currency code, e.g. USD, XCD, EUR',
      maxLength: 8,
    },
    deadline: { kind: 'date', label: 'Deadline', describe: 'Application deadline as YYYY-MM-DD' },
    eligibility: {
      kind: 'string',
      label: 'Eligibility',
      describe: 'Who may apply',
      maxLength: 2000,
    },
    application_url: {
      kind: 'url',
      label: 'Application link',
      describe: 'Link to apply, only if one appears in the text',
    },
    grant_type: {
      kind: 'enum',
      label: 'Grant type',
      describe: 'Closest category',
      values: GRANT_TYPES,
    },
    is_climate_action: {
      kind: 'boolean',
      label: 'Climate action',
      describe: 'True only if climate, resilience or environment is a stated focus',
    },
  },
  project: {
    title: { kind: 'string', label: 'Title', describe: 'Name of the project', maxLength: 200 },
    summary: {
      kind: 'string',
      label: 'Summary',
      describe: 'One-sentence summary, max 200 characters',
      maxLength: 300,
    },
    description: {
      kind: 'string',
      label: 'Description',
      describe: 'Two to four paragraphs describing the project',
      maxLength: 4000,
    },
    tags: {
      kind: 'string[]',
      label: 'Tags',
      describe: 'Up to 6 short topic tags, lowercase',
    },
  },
}

export const MAX_EVIDENCE_CHARS = 200

/** Turns a proposal into the column's actual type, or null if it cannot. */
export function coerce(spec: FieldSpec, raw: unknown): unknown {
  switch (spec.kind) {
    case 'string': {
      if (typeof raw !== 'string') return null
      const value = raw.trim()
      if (!value) return null
      return spec.maxLength ? value.slice(0, spec.maxLength) : value
    }
    case 'number': {
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
      if (typeof raw === 'string') {
        // "US$ 50,000" / "50 000" — strip everything that is not part of the number
        const cleaned = raw.replace(/[^0-9.]/g, '')
        const parsed = Number.parseFloat(cleaned)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }
    case 'boolean':
      return typeof raw === 'boolean' ? raw : null
    case 'date': {
      if (typeof raw !== 'string') return null
      const match = raw.trim().match(/^\d{4}-\d{2}-\d{2}/)
      if (!match) return null
      const date = new Date(`${match[0]}T00:00:00Z`)
      return Number.isNaN(date.getTime()) ? null : match[0]
    }
    case 'url': {
      if (typeof raw !== 'string') return null
      const value = raw.trim()
      return /^https?:\/\/\S+$/i.test(value) ? value.slice(0, 500) : null
    }
    case 'enum': {
      if (typeof raw !== 'string') return null
      const value = raw.trim().toLowerCase()
      return spec.values?.includes(value) ? value : null
    }
    case 'string[]': {
      if (!Array.isArray(raw)) return null
      const values = raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 6)
      return values.length ? values : null
    }
    default:
      return null
  }
}

/**
 * Drops anything the model invented or mistyped, so the client can trust every
 * key it gets back. Mirrors how api/ai-search.ts filters ids against the site
 * map before returning them.
 */
export function sanitizeFields(
  spec: Record<string, FieldSpec>,
  raw: unknown
): Record<string, { value: unknown; confidence: number; evidence?: string }> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const out: Record<string, { value: unknown; confidence: number; evidence?: string }> = {}
  for (const [key, proposal] of Object.entries(raw as Record<string, any>)) {
    const fieldSpec = spec[key]
    if (!fieldSpec) continue
    if (!proposal || typeof proposal !== 'object') continue

    const value = coerce(fieldSpec, proposal.value)
    if (value === null || value === undefined) continue

    const confidence =
      typeof proposal.confidence === 'number' &&
      proposal.confidence >= 0 &&
      proposal.confidence <= 1
        ? proposal.confidence
        : 0.5

    const evidence =
      typeof proposal.evidence === 'string'
        ? proposal.evidence.slice(0, MAX_EVIDENCE_CHARS)
        : undefined

    out[key] = { value, confidence, evidence }
  }
  return out
}

/** The system prompt's field list, built from the spec so the two never drift. */
export function describeFields(spec: Record<string, FieldSpec>): string {
  return Object.entries(spec)
    .map(([key, field]) => {
      const type = field.kind === 'enum' ? `one of: ${field.values?.join(', ')}` : field.kind
      return `- ${key} (${type}): ${field.describe}`
    })
    .join('\n')
}

/** Field labels for the review panel. */
export function fieldLabel(entityType: string, key: string): string {
  return FIELD_SPECS[entityType]?.[key]?.label || key
}
