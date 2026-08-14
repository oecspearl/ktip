import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  ADMIN_CONSOLE_KEYS,
  ALL_PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  MATRIX_ROLES,
  SAFEGUARD_DENY,
  SUPERVISOR_DOMAIN_KEYS,
} from '../permissions'
import type { PermissionKey } from '../../types'

/**
 * The permission matrix exists twice: as DEFAULT_ROLE_PERMISSIONS here, and as
 * default_role_permissions() in SQL. The SQL copy is authoritative — it is what
 * the seed writes and what "Reset to defaults" at /admin/roles restores — and
 * the TypeScript copy is the fallback the client renders from before
 * get_my_permissions() answers.
 *
 * They are edited by hand, in different files, in different languages, and
 * nothing at build time relates them. Drift is silent and shows up as an admin
 * screen that disagrees with the database. So it is checked here instead.
 *
 * The same argument applies to the safeguard list, which exists a third time as
 * a hard-coded IN clause inside has_permission().
 */

const root = process.cwd()
const migrationsDir = resolve(root, 'supabase/migrations')

/** The newest migration that redefines a function — later ones win at apply time. */
function latestMigrationDefining(fn: string): { name: string; sql: string } {
  const candidates = readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }))
    .filter((m) => m.sql.includes(`CREATE OR REPLACE FUNCTION ${fn}(`))

  const last = candidates[candidates.length - 1]
  if (!last) throw new Error(`no migration defines ${fn}()`)
  return last
}

/** Every ('role', 'permission') tuple in the function's VALUES list. */
function parseSqlMatrix(sql: string): Record<string, string[]> {
  const body = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION default_role_permissions('))
  const values = body.slice(body.indexOf('SELECT * FROM (VALUES'), body.indexOf(') AS t(role_slug'))

  const out: Record<string, string[]> = {}
  for (const [, role, key] of values.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z:_]+)'\s*\)/g)) {
    ;(out[role] ??= []).push(key)
  }
  return out
}

describe('the default permission matrix', () => {
  const { name, sql } = latestMigrationDefining('default_role_permissions')
  const fromSql = parseSqlMatrix(sql)

  it(`is defined by a migration this test can read (${name})`, () => {
    expect(Object.keys(fromSql).length).toBeGreaterThan(10)
  })

  it('covers the same roles in both copies', () => {
    // super_admin is `SELECT … FROM permission_definitions` in SQL rather than a
    // VALUES list, so it is absent from the parse by design and checked below.
    const sqlRoles = Object.keys(fromSql).sort()
    const tsRoles = Object.keys(DEFAULT_ROLE_PERMISSIONS)
      .filter((r) => r !== 'super_admin')
      .sort()

    expect(sqlRoles).toEqual(tsRoles)
  })

  it('grants the same permissions to every role in both copies', () => {
    for (const [role, keys] of Object.entries(fromSql)) {
      const ts = [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])].sort()
      expect([...keys].sort(), `role_permissions drift for '${role}'`).toEqual(ts)
    }
  })

  it('grants super_admin every permission', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.super_admin].sort()).toEqual([...ALL_PERMISSION_KEYS].sort())
  })

  it('names only permissions that exist', () => {
    const known = new Set<string>(ALL_PERMISSION_KEYS)
    const unknown = Object.values(fromSql)
      .flat()
      .filter((k) => !known.has(k))

    expect([...new Set(unknown)]).toEqual([])
  })

  it('has a column for every non-alias role in the catalog', () => {
    const catalog = MATRIX_ROLES.map((r) => r.slug).sort()
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(catalog)
  })

  it('withholds the platform keys from every role but super_admin', () => {
    // The six organisation roles added by 110 exist to participate in the
    // ecosystem, not to run it. igo is the one to watch: its real-world
    // referent also staffs super_admin.
    const operator: PermissionKey[] = ['org:manage', 'members:manage', 'role:manage']
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role === 'super_admin') continue
      expect(keys.filter((k) => operator.includes(k)), `'${role}' holds an operator key`).toEqual([])
    }
  })
})

/**
 * The three-way split of the admin console (migration 116).
 *
 * The division only exists as long as the two supervisors' domain keys stay
 * disjoint. Nothing about the matrix enforces that — DEFAULT_ROLE_PERMISSIONS is
 * a hand-edited object, and widening one seat into the other's territory is a
 * one-line change that no screen would complain about. So it is checked here.
 */
describe('the supervisor split', () => {
  const people = new Set(DEFAULT_ROLE_PERMISSIONS.people_supervisor ?? [])
  const programme = new Set(DEFAULT_ROLE_PERMISSIONS.programme_supervisor ?? [])

  it('defines both seats', () => {
    expect(people.size).toBeGreaterThan(0)
    expect(programme.size).toBeGreaterThan(0)
  })

  it('keeps the two domains disjoint', () => {
    const overlap = SUPERVISOR_DOMAIN_KEYS.people_supervisor.filter((k) =>
      SUPERVISOR_DOMAIN_KEYS.programme_supervisor.includes(k)
    )
    expect(overlap, 'the supervisor seats must not share a domain key').toEqual([])
  })

  it('grants each seat exactly its own domain and none of the other', () => {
    for (const [role, keys] of Object.entries(SUPERVISOR_DOMAIN_KEYS)) {
      const held = role === 'people_supervisor' ? people : programme
      const other = role === 'people_supervisor' ? programme : people

      for (const key of keys) {
        expect(held.has(key), `'${role}' should hold its own key ${key}`).toBe(true)
        expect(other.has(key), `the other seat must not hold ${key}`).toBe(false)
      }
    }
  })

  it('withholds event:manage from everyone but super_admin', () => {
    // Events, the venue and LiveKit stay with the Super Admin. The key exists so
    // that the events RLS names a capability instead of a role — delegating it
    // later should be a toggle at /admin/roles, and a deliberate one.
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role === 'super_admin') continue
      expect(keys, `'${role}' holds event:manage`).not.toContain('event:manage')
    }
  })

  it('lets both seats act as ordinary members', () => {
    // The relay session in docs/QA-RELAY-SESSION.md has each supervisor create a
    // project and apply for a grant so the handoffs are real. Without these they
    // would need a second account each.
    for (const key of ['project:create', 'forum:post', 'grant:apply', 'dm:receive'] as const) {
      expect(people.has(key), `the People seat needs ${key}`).toBe(true)
      expect(programme.has(key), `the Programmes seat needs ${key}`).toBe(true)
    }
  })

  it('opens the admin console to every seat that owns a page in it', () => {
    // AdminRoute admits on ADMIN_CONSOLE_KEYS. A seat holding none of them would
    // be locked out of pages that are entirely its own — which is exactly what
    // happened to the Programmes seat while the gate read org:manage.
    for (const role of ['super_admin', 'people_supervisor', 'programme_supervisor', 'safety_admin']) {
      const held = DEFAULT_ROLE_PERMISSIONS[role] ?? []
      expect(
        held.some((k) => ADMIN_CONSOLE_KEYS.includes(k)),
        `'${role}' cannot open /admin`
      ).toBe(true)
    }
  })

  it('never admits an ordinary member to the console', () => {
    const admin = new Set(['super_admin', 'people_supervisor', 'programme_supervisor', 'safety_admin'])
    for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (admin.has(role)) continue
      const opens = keys.filter((k) => ADMIN_CONSOLE_KEYS.includes(k))
      expect(opens, `'${role}' would be admitted to /admin`).toEqual([])
    }
  })
})

describe('the student safeguard list', () => {
  const { sql } = latestMigrationDefining('has_permission')

  it('matches the hard-coded IN clause in has_permission()', () => {
    const body = sql.slice(sql.lastIndexOf('CREATE OR REPLACE FUNCTION has_permission('))
    // `) THEN` also closes the is_suspended() guard above, so the search for the
    // clause end has to start from the clause itself rather than from the body.
    const start = body.indexOf("IF 'student' = ANY(v_roles)")
    const clause = body.slice(start, body.indexOf(') THEN', start))
    const keys = [...clause.matchAll(/'([a-z:_]+)'/g)].map((m) => m[1]).filter((k) => k !== 'student')

    expect(keys.sort()).toEqual([...SAFEGUARD_DENY.student].sort())
  })

  it('still denies students unmonitored messaging and the administration of funds', () => {
    // grant:apply left this list in 110 as a deliberate policy change. These
    // four did not, and a change to them should have to break a test first.
    expect([...SAFEGUARD_DENY.student].sort()).toEqual([
      'dm:initiate',
      'grant:manage_funds',
      'moderation:action',
      'moderation:escalate',
    ])
  })

  it('never denies a key that no longer exists', () => {
    const known = new Set<string>(ALL_PERMISSION_KEYS)
    for (const keys of Object.values(SAFEGUARD_DENY)) {
      expect(keys.filter((k) => !known.has(k))).toEqual([])
    }
  })
})
