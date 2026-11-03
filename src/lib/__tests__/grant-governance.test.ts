import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Funding governance (migrations 180–182), checked where it is enforced.
 *
 * The rules live in SQL function bodies that later migrations restate in
 * full. A restatement copied from an older body would quietly hand
 * administrators the decision on applications again, and no screen would
 * show it. So the newest definition of each function is read and checked.
 */

const migrationsDir = resolve(process.cwd(), 'supabase/migrations')

const migrations = readdirSync(migrationsDir)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }))

/** The body of the newest CREATE OR REPLACE FUNCTION for `fn`, comments stripped. */
function latestBody(fn: string): { name: string; body: string } {
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${fn}\\(`)
  const last = [...migrations].reverse().find((m) => pattern.test(m.sql))
  if (!last) throw new Error(`no migration defines ${fn}()`)
  const code = last.sql.replace(/--[^\n]*/g, '')
  const starts = [...code.matchAll(new RegExp(pattern.source, 'g'))]
  const start = starts[starts.length - 1].index!
  const rest = code.slice(start)
  // Bodies are dollar-quoted with $$ or $fn$; the definition ends at the
  // closing quote followed by a semicolon.
  const end = rest.search(/\$(?:fn)?\$;/)
  return { name: last.name, body: rest.slice(0, end) }
}

describe('who decides an application', () => {
  it.each(['decide_grant_application', 'record_grant_award'])(
    '%s() admits the funder only, not grant:manage',
    (fn) => {
      const { name, body } = latestBody(fn)
      expect(body, `${name} restates ${fn}() with an administrator arm`).not.toContain("'grant:manage'")
      expect(body).toContain('is_grant_funder(')
    }
  )

  it('leaves no admin UPDATE policy on grant_applications', () => {
    // The newest mention of the policy must be the DROP that retired it.
    const mentions = migrations.flatMap((m) =>
      [...m.sql.matchAll(/(DROP|CREATE) POLICY (?:IF EXISTS )?"OECS admins can update any application"/g)].map(
        (hit) => ({ name: m.name, verb: hit[1] })
      )
    )
    expect(mentions[mentions.length - 1]?.verb).toBe('DROP')
  })
})

describe('suspending a funding call', () => {
  it('needs grant:manage and a reason', () => {
    const { body } = latestBody('set_grant_suspension')
    expect(body).toContain("has_permission(v_uid, 'grant:manage')")
    expect(body).toMatch(/p_suspended AND v_reason IS NULL/)
  })

  it('stops anybody but a grants administrator moving the suspension columns', () => {
    const { body } = latestBody('guard_grant_non_owner_edits')
    expect(body).toContain("has_permission(v_uid, 'grant:manage')")
    // Administrators may only touch these. A new column here is a new power.
    const cols = body.match(/v_admin_cols TEXT\[\] := ARRAY\[([^\]]*)\]/)?.[1] ?? ''
    expect(
      [...cols.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    ).toEqual(
      [
        'is_active',
        'moderation_severity',
        'moderation_status',
        'suspended_at',
        'suspended_by',
        'suspension_reason',
        'updated_at',
      ]
    )
  })
})
