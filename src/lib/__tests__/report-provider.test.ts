import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REPORT_PROMPT_VERSION,
  ReportProviderRateLimited,
  getReportProvider,
  reportJsonSchema,
} from '../../../api/_lib/report-provider'
import { composeFactPack } from '../../../api/_lib/report-fact-pack'
import type { RawFactPack } from '../../../api/_lib/report-fact-pack'

const env = { ...process.env }

const raw: RawFactPack = {
  period: { kind: 'month', start: '2026-08-01', end: '2026-09-01', prior_start: '2026-07-01', prior_end: '2026-08-01' },
  computed_at: '2026-09-01T06:00:00Z',
  pulse: { 't33.new_registrations_total': 40, 't34.mau_pct': 33 },
  prior_pulse: {},
  targets: [{ kpi_key: 't34.mau_pct', target_value: 40, unit: 'percent' }],
  history: [],
  highlights: { projects: [], events: [], resources: [], grants_awarded: 0 },
  meta: { total_members: 214, oecs_states_flagged: 12, roadmap_oecs_states: 12 },
}
const pack = composeFactPack(raw)

const goodAnswer = {
  executive_summary_md: 'Membership grew to 40 new registrations this month while monthly active share stood at 33% against a 40% target.',
  sections: [{ table: 'T34', commentary_md: 'Monthly active share is at risk at 33%.' }],
  at_risk: [{ kpi_key: 't34.mau_pct', why: 'At 33% against a 40% target, within the at-risk band.' }],
  suggested_actions: [
    {
      kpi_key: 't34.mau_pct',
      action: 'Run a re-engagement email to members inactive for thirty days.',
      owner_role: 'System Administrator',
      priority: 'high',
      rationale: 'Active share is the KPI furthest from target that an operator can move this month.',
    },
    {
      kpi_key: 't99.invented',
      action: 'Do something about a KPI that does not exist in the pack.',
      owner_role: 'Partnerships Officer',
      priority: 'low',
      rationale: 'This should be dropped because the key is not in the fact pack.',
    },
  ],
  highlights_md: '',
  data_quality_notes: [],
}

type FetchLike = typeof fetch

function mockChat(content: unknown, init: ResponseInit = {}) {
  return vi.fn<FetchLike>(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
      status: 200,
      ...init,
    })
  )
}

beforeEach(() => {
  process.env.REPORT_PROVIDER = 'openrouter'
  process.env.OPENROUTER_API_KEY = 'test-key'
})

afterEach(() => {
  process.env = { ...env }
  vi.restoreAllMocks()
})

describe('provider selection', () => {
  it('is null when no key is configured, which is a supported state', () => {
    delete process.env.OPENROUTER_API_KEY
    expect(getReportProvider()).toBeNull()
  })

  it('is null when switched off', () => {
    process.env.REPORT_PROVIDER = 'none'
    expect(getReportProvider()).toBeNull()
  })

  it('names the vendor and model in its id, and has a prompt version', () => {
    process.env.OPENROUTER_REPORT_MODEL = 'openai/gpt-4o-mini'
    expect(getReportProvider()?.id).toBe('openrouter:openai/gpt-4o-mini')
    expect(REPORT_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}\.\d+$/)
  })
})

describe('the output schema', () => {
  it('is a strict JSON schema with every field required', () => {
    const schema = reportJsonSchema() as any
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(
      expect.arrayContaining(['executive_summary_md', 'sections', 'at_risk', 'suggested_actions', 'highlights_md', 'data_quality_notes'])
    )
  })
})

describe('draft', () => {
  it('holds the vendor to the schema and drops actions that cite unknown keys', async () => {
    const fetchMock = mockChat(goodAnswer)
    vi.stubGlobal('fetch', fetchMock)

    const draft = await getReportProvider()!.draft(pack, new AbortController().signal)
    expect(draft.output.suggested_actions).toHaveLength(1)
    expect(draft.dropped_keys).toEqual(['t99.invented'])

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body.temperature).toBe(0)
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
    // The pack is the user turn, verbatim, so the model sees exactly what is stored.
    expect(JSON.parse(body.messages[1].content).period.label).toBe('August 2026')
  })

  it('rejects an answer that does not fit the schema instead of storing it', async () => {
    vi.stubGlobal('fetch', mockChat({ executive_summary_md: 'too short', sections: 'nope' }))
    await expect(getReportProvider()!.draft(pack, new AbortController().signal)).rejects.toThrow(/failed validation/)
  })

  it('surfaces a rate limit with the retry hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('slow down', { status: 429, headers: { 'retry-after': '30' } }))
    )
    await expect(getReportProvider()!.draft(pack, new AbortController().signal)).rejects.toBeInstanceOf(
      ReportProviderRateLimited
    )
  })
})
