import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scanText, SQL_ESCAPE_CLASS } from '../moderation/scan'
import type { ModerationRule } from '../moderation/types'
import corpus from '../moderation/__fixtures__/corpus.json'

/**
 * The matcher exists twice: as scan_content() in 065_moderation.sql, which
 * decides whether a row is quarantined, and as scanText() here, which decides
 * what the member sees while typing. They are written in different languages,
 * in different files, and nothing at build time relates them.
 *
 * Drift is silent and lands on the member: a word the browser strikes through
 * that the server accepts is a submit button that never re-enables, and a word
 * the browser ignores that the server quarantines is a post that vanishes with
 * no explanation. So the pieces that must not move are asserted against the
 * migration text directly, in the same spirit as rbac-parity.test.ts.
 *
 * This cannot run Postgres. The golden corpus is the other half: the SQL test
 * at supabase/tests/111_moderation_client_rules_test.sql runs the identical
 * strings through scan_content() and asserts the same severities.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/065_moderation.sql'),
  'utf8'
)

const scanContentBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION scan_content('),
  migration.indexOf('REVOKE ALL ON FUNCTION scan_content(')
)

/** The seeded rules, parsed out of the INSERT so the corpus runs against the real list. */
function seededRules(): ModerationRule[] {
  const block = migration.slice(
    migration.indexOf('INSERT INTO moderation_terms (pattern, kind, severity, category, note)'),
    migration.indexOf('ON CONFLICT DO NOTHING;')
  )

  const rules: ModerationRule[] = []
  const tuple = /\('((?:[^']|'')*)',\s*'(term|regex)',\s*'(low|medium|high)',\s*'([a-z_]+)'/g
  for (const [, pattern, kind, severity, category] of block.matchAll(tuple)) {
    rules.push({
      id: `seed-${rules.length}`,
      pattern: pattern.replace(/''/g, "'"),
      kind: kind as ModerationRule['kind'],
      severity: severity as ModerationRule['severity'],
      category: category as ModerationRule['category'],
    })
  }
  return rules
}

describe('scan.ts still matches scan_content()', () => {
  it('escapes the identical character set', () => {
    // The highest-value assertion in the file. A term containing punctuation is
    // escaped on both sides, and if the two sets ever differ the disagreement
    // is invisible until a moderator adds a rule with a bracket in it.
    const [, sqlClass] = scanContentBody.match(/regexp_replace\([^,]+,\s*'\(\[(.+?)\]\)'/) ?? []
    expect(sqlClass, 'could not find the escape class in scan_content()').toBeDefined()

    // SQL doubles the backslash for the string literal; unwrap before comparing.
    const sqlChars = new Set(sqlClass!.replace(/\\\\/g, '\\').replace(/\\/g, ''))
    const tsChars = new Set(
      SQL_ESCAPE_CLASS.source.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\/g, '')
    )
    expect([...tsChars].sort()).toEqual([...sqlChars].sort())
  })

  it('still wraps term rules in \\m and \\M', () => {
    // If a future migration switches to \y or \b, the lookarounds in scan.ts
    // stop being the right translation and this fails loudly.
    expect(scanContentBody).toContain("'\\m' ||")
    expect(scanContentBody).toContain("|| '\\M'")
  })

  it('still ranks severity high 3, medium 2, low 1', () => {
    expect(scanContentBody).toMatch(/WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END/)
  })

  it('still matches regex rules case-insensitively and unanchored', () => {
    expect(scanContentBody).toContain('v_hit := p_text ~* v_rule.pattern;')
  })

  it('compiles every seeded pattern in the browser', () => {
    const rules = seededRules()
    expect(rules.length).toBeGreaterThan(0)
    const res = scanText('nothing here', rules)
    expect(res.skipped).toEqual([])
  })
})

describe('golden corpus', () => {
  const rules = seededRules()

  // Guards against the two halves drifting apart by addition rather than by
  // edit: adding a case here without adding it to the SQL test fails there.
  it('has the agreed number of cases', () => {
    expect(corpus.cases).toHaveLength(25)
  })

  it.each(corpus.cases)('$why — "$text"', ({ text, expected }) => {
    expect(scanText(text, rules, { normalize: false }).severity).toBe(expected)
  })
})
