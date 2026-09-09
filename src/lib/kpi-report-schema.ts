import { z } from 'zod'
import type { KpiStatus, KpiTable, KpiUnit } from './kpi-catalog'

/**
 * The shapes a periodic report is made of (migration 147), shared by the
 * server that drafts it and the console that shows it.
 *
 * The report output schema is also what the model is constrained to return:
 * api/_lib/report-provider.ts turns it into a JSON schema for the provider's
 * structured-output mode, then validates the answer against it again here.
 * Every field is required, because the strict mode demands it and because an
 * optional field is one the model will skip when it matters most.
 */

export type ReportPeriodKind = 'month' | 'quarter' | 'year'

/** The roadmap's named owners (§5 governance). An action is assigned to one of these. */
export const REPORT_OWNER_ROLES = [
  'System Administrator',
  'Technical Specialist Innovation and Entrepreneurship',
  'Technical Specialist EMIS and Virtual Campus',
  'Competitiveness Business Unit',
  'Partnerships Officer',
  'Regional Technical Support Team',
] as const
export type ReportOwnerRole = (typeof REPORT_OWNER_ROLES)[number]

/** One KPI as the report sees it: the reading, the target, and what we make of it. */
export interface FactPackKpi {
  key: string
  table: KpiTable
  label: string
  unit: KpiUnit
  direction: 'up' | 'down'
  phase: 1 | 2 | 3
  reported_only: boolean
  /** The reading for the period, or null with a reason. */
  value: number | null
  unavailable_reason: string | null
  /** The reading for the previous period, or null. */
  prior_value: number | null
  target: number | null
  /** 0–1.5 from kpiProgress(), or null when there is nothing to judge. */
  progress: number | null
  status: KpiStatus
  /** Percentage change on the prior period, or null. */
  change_pct: number | null
  /** Snapshot readings at this cadence, oldest first; null where unmeasured. */
  history: Array<{ period_start: string; value: number | null }>
}

export interface FactPack {
  period: { kind: ReportPeriodKind; start: string; end: string; label: string; prior_label: string }
  computed_at: string
  kpis: FactPackKpi[]
  /** Counts of KPIs by status, so the model never has to tally. */
  status_counts: Record<KpiStatus, number>
  highlights: {
    projects: Array<{ title: string; category: string | null }>
    events: Array<{ title: string; type: string | null; date: string | null }>
    resources: Array<{ title: string; type: string | null }>
    grants_awarded: number
  }
  meta: {
    total_members: number | null
    oecs_states_flagged: number | null
    roadmap_oecs_states: number
  }
  /** Things the reader must know about the numbers, written by the platform not the model. */
  data_quality: string[]
}

// ---------------------------------------------------------------- output

const kpiKey = z.string().min(3).max(64)

export const suggestedActionSchema = z.object({
  kpi_key: kpiKey,
  action: z.string().min(10).max(400),
  owner_role: z.enum(REPORT_OWNER_ROLES),
  priority: z.enum(['high', 'medium', 'low']),
  rationale: z.string().min(10).max(400),
})

export const reportSectionSchema = z.object({
  table: z.enum(['T32', 'T33', 'T34', 'T35', 'T36', 'T37', 'T38']),
  commentary_md: z.string().max(1500),
})

export const reportOutputSchema = z.object({
  executive_summary_md: z.string().min(50).max(2500),
  sections: z.array(reportSectionSchema).max(7),
  at_risk: z.array(z.object({ kpi_key: kpiKey, why: z.string().min(10).max(300) })).max(10),
  suggested_actions: z.array(suggestedActionSchema).max(8),
  highlights_md: z.string().max(1200),
  data_quality_notes: z.array(z.string().max(300)).max(10),
})

export type ReportOutput = z.infer<typeof reportOutputSchema>
export type SuggestedAction = z.infer<typeof suggestedActionSchema>
export type ReportSection = z.infer<typeof reportSectionSchema>

/** A kpi_reports row as the console reads it. */
export interface KpiReportRow {
  id: string
  period_kind: ReportPeriodKind
  period_start: string
  period_end: string
  status: 'draft' | 'published'
  fact_pack: FactPack
  summary_md: string | null
  sections: ReportSection[]
  suggested_actions: SuggestedAction[]
  at_risk: Array<{ kpi_key: string; why: string }>
  data_quality_notes: string[]
  highlights: string[] | { markdown?: string }
  model: string | null
  prompt_version: string | null
  generated_at: string
  published_at: string | null
  published_by: string | null
  sent_at: string | null
  sent_to: string[] | null
  created_at: string
  updated_at: string
}

/**
 * Every kpi_key the model cites must exist in the fact pack. A model that
 * invents "t39.magic" is a model that is not reading its input; the action is
 * dropped rather than the report rejected, and the drop is recorded.
 */
export function pruneUnknownKeys(output: ReportOutput, known: ReadonlySet<string>): { output: ReportOutput; dropped: string[] } {
  const dropped: string[] = []
  const keep = <T extends { kpi_key: string }>(items: T[]) =>
    items.filter((item) => {
      if (known.has(item.kpi_key)) return true
      dropped.push(item.kpi_key)
      return false
    })
  return {
    output: { ...output, at_risk: keep(output.at_risk), suggested_actions: keep(output.suggested_actions) },
    dropped,
  }
}
