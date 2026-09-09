import { describe, expect, it } from 'vitest'
import { composeFactPack, deterministicOutput, periodLabel, type RawFactPack } from '../../../api/_lib/report-fact-pack'

/**
 * The fact pack is the only thing the model sees, so what it says about a
 * missing reading is what the report will say. Pinning: an unreadable KPI is
 * null with a reason, never 0; status comes from the catalog's thresholds;
 * the platform's own data-quality notes are present before any model runs.
 */

const raw: RawFactPack = {
  period: { kind: 'month', start: '2026-08-01', end: '2026-09-01', prior_start: '2026-07-01', prior_end: '2026-08-01' },
  computed_at: '2026-09-01T06:00:00Z',
  pulse: {
    't33.new_registrations_total': 40,
    't34.mau_pct': 33,
    't36.ticket_hours': 19.4,
    't36.security_incidents': 0,
    't36.complaints_total': 6,
    't35.resource_reach_pct': 44,
    // t34.nps deliberately absent: the collector has no wave yet.
  },
  prior_pulse: { 't33.new_registrations_total': 32, 't34.mau_pct': 35.2 },
  targets: [
    { kpi_key: 't33.new_registrations_total', target_value: 300, unit: 'count' },
    { kpi_key: 't34.mau_pct', target_value: '40', unit: 'percent' },
    { kpi_key: 't36.ticket_hours', target_value: 24, unit: 'hours' },
    { kpi_key: 't36.security_incidents', target_value: 0, unit: 'count' },
  ],
  history: [
    { period_start: '2026-07-01', kpi_key: 't34.mau_pct', value: 35.2 },
    { period_start: '2026-08-01', kpi_key: 't34.mau_pct', value: null },
  ],
  highlights: { projects: [{ title: 'Reef Monitor', category: 'environment' }], events: [], resources: [], grants_awarded: 2 },
  meta: { total_members: 214, oecs_states_flagged: 11, roadmap_oecs_states: 12 },
}

describe('composeFactPack', () => {
  const pack = composeFactPack(raw)
  const by = (key: string) => pack.kpis.find((k) => k.key === key)!

  it('labels the period like the console does', () => {
    expect(pack.period.label).toBe('August 2026')
    expect(pack.period.prior_label).toBe('July 2026')
    expect(periodLabel('quarter', '2026-10-01')).toBe('Q4 2026')
    expect(periodLabel('year', '2026-01-01')).toBe('2026')
  })

  it('uses the catalog thresholds for status', () => {
    expect(by('t33.new_registrations_total')).toMatchObject({ value: 40, target: 300, status: 'bad' })
    expect(by('t34.mau_pct')).toMatchObject({ value: 33, target: 40, status: 'warn', change_pct: -6.3 })
    // lower-is-better: 19.4h against a 24h ceiling is met
    expect(by('t36.ticket_hours')).toMatchObject({ status: 'good' })
    // a zero target is met by a zero reading
    expect(by('t36.security_incidents')).toMatchObject({ value: 0, status: 'good' })
  })

  it('leaves a missing reading null with a reason, never zero', () => {
    const nps = by('t34.nps')
    expect(nps.value).toBeNull()
    expect(nps.status).toBe('none')
    expect(nps.unavailable_reason).toMatch(/phase 2/)
    expect(nps.change_pct).toBeNull()
  })

  it('does not judge a reported-only figure', () => {
    expect(by('t36.complaints_total')).toMatchObject({ value: 6, reported_only: true, progress: null, status: 'none' })
  })

  it('tallies statuses so the model never counts', () => {
    const total = Object.values(pack.status_counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(pack.kpis.length)
    expect(pack.status_counts.good).toBe(2)
    expect(pack.status_counts.warn).toBe(1)
    expect(pack.status_counts.bad).toBe(1)
  })

  it('carries history oldest first with gaps kept as null', () => {
    expect(by('t34.mau_pct').history).toEqual([
      { period_start: '2026-07-01', value: 35.2 },
      { period_start: '2026-08-01', value: null },
    ])
  })

  it('writes the platform-side data-quality notes', () => {
    expect(pack.data_quality.join('\n')).toMatch(/unmeasured, not zero/)
    expect(pack.data_quality.join('\n')).toMatch(/consenting sessions only/)
    expect(pack.data_quality.join('\n')).toMatch(/flags 11 OECS member states; the roadmap counts 12/)
  })
})

describe('deterministicOutput', () => {
  it('is a complete report with blank prose when no model runs', () => {
    const out = deterministicOutput(composeFactPack(raw))
    expect(out.executive_summary_md).toMatch(/Commentary was not generated/)
    expect(out.sections.length).toBeGreaterThan(0)
    expect(out.sections.every((s) => s.commentary_md === '')).toBe(true)
    expect(out.suggested_actions).toEqual([])
    expect(out.at_risk.map((a) => a.kpi_key)).toEqual(['t33.new_registrations_total', 't34.mau_pct'])
  })
})
