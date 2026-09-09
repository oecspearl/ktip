import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PLATFORM_KPIS, kpiProgress, kpiStatus } from '../kpi-catalog'

/**
 * The results framework exists in three places: the catalog (meaning), the
 * kpi_targets seed (targets) and the pulse RPCs (readings). Nothing at build
 * time relates them, so a KPI can be added to one and forgotten in another —
 * a tile with no target draws no bar, and a target with no tile is never
 * reported. Checked here, the way rbac-parity checks the permission matrix.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
const migrations = readdirSync(migrationsDir)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
  .join('\n')

describe('the KPI catalog agrees with the migrations', () => {
  it('has no duplicate keys', () => {
    const keys = PLATFORM_KPIS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('seeds a target for every KPI a deploy is expected to measure', () => {
    // Phase 3 KPIs are attested by a person and may reasonably have no target
    // yet, and a reported-only figure has none by design; everything else is
    // measured against one from day one.
    const missing = PLATFORM_KPIS.filter((k) => k.phase < 3 && !k.reportedOnly).filter(
      (k) => !migrations.includes(`('${k.key}',`),
    )
    expect(missing.map((k) => k.key)).toEqual([])
  })

  it('reads every key from a pulse field some migration emits', () => {
    // read() is a closure, so the field it reads is recovered by feeding it a
    // probe that records the lookup. A KPI that reads a field no RPC builds
    // is "not yet measured" forever, silently.
    const missing: string[] = []
    for (const kpi of PLATFORM_KPIS) {
      const looked: string[] = []
      const probe = new Proxy({} as Record<string, number>, {
        get: (_t, prop) => {
          if (typeof prop === 'string') looked.push(prop)
          return 1
        },
      })
      kpi.read(probe)
      for (const field of looked) {
        if (!migrations.includes(`'${field}'`)) missing.push(`${kpi.key} -> ${field}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('never turns a missing field into a number', () => {
    for (const kpi of PLATFORM_KPIS) {
      expect(kpi.read({}).state, kpi.key).toBe('unavailable')
      expect(kpi.read(undefined).state, kpi.key).toBe('unavailable')
    }
  })
})

describe('kpiProgress', () => {
  it('inverts for lower-is-better KPIs', () => {
    expect(kpiProgress(12, 24, 'down')).toBe(1.5)
    expect(kpiProgress(48, 24, 'down')).toBe(0.5)
    expect(kpiProgress(12, 24, 'up')).toBe(0.5)
  })

  it('decides a zero target outright rather than dividing by it', () => {
    // "Zero critical incidents": met by an empty count, missed by any other.
    expect(kpiProgress(0, 0, 'down')).toBe(1)
    expect(kpiProgress(1, 0, 'down')).toBe(0)
    expect(kpiStatus(kpiProgress(0, 0, 'down'))).toBe('good')
    expect(kpiStatus(kpiProgress(2, 0, 'down'))).toBe('bad')
    // A zero target for a grow-it KPI is a data error, not 100%.
    expect(kpiProgress(5, 0, 'up')).toBeNull()
  })
})
