/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { PROFILE_CHIP, PROFILE_PUBLIC_COLUMNS } from '../profile-columns'

/**
 * The profiles column allowlist (168).
 *
 * Since 168 a client reads only PROFILE_PUBLIC_COLUMNS off `profiles`; any
 * other column — `select('*')`, a `profiles(*)` embed, a named bio — fails the
 * whole request with 42501. That failure only shows up against a database with
 * 168 applied, so these checks catch it here instead:
 *
 *   1. the grants in the migrations and PROFILE_PUBLIC_COLUMNS agree, so a
 *      migration that opens a column also updates the list, and vice versa;
 *   2. no client code asks profiles for a column outside the list.
 *
 * api/ handlers are held to (2) only for `profiles(*)`: most of them read with
 * the service role, which the grants do not touch, and the one that reads with
 * the caller's token (cv/generate) goes through get_my_profile().
 */

const migrations = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const appSources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const apiSources = import.meta.glob('/api/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const isTest = (path: string) => /\.test\.tsx?$/.test(path)
// Comment lines quote the patterns this test forbids ("a bare profiles(*)
// embed is ambiguous…"); only code counts.
const code = (source: string) =>
  source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
const app = Object.entries(appSources)
  .filter(([path]) => !isTest(path))
  .map(([path, source]) => [path, code(source)] as const)
const api = Object.entries(apiSources)
  .filter(([path]) => !isTest(path))
  .map(([path, source]) => [path, code(source)] as const)

const PUBLIC = new Set<string>(PROFILE_PUBLIC_COLUMNS)
const FIRST_COLUMN_GRANT = 168

/** `a, b:c, d::text` → ['a', 'c', 'd'] — the column each item reads. */
function columnsOf(list: string): string[] {
  return list
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const afterAlias = item.includes(':') && !item.includes('::') ? item.split(':').pop()! : item
      return afterAlias.split('::')[0].trim()
    })
}

/**
 * A select argument → the columns it names, or null when it is not something
 * we can read. A bare identifier resolves to a `const NAME = '...'` in the same
 * file (SEARCH_COLUMNS and the like).
 */
function selectedColumns(arg: string, source: string): string[] | null {
  const trimmed = arg.trim()
  if (trimmed === 'PROFILE_CHIP') return columnsOf(PROFILE_CHIP)
  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    const decl = source.match(new RegExp(`const ${trimmed}\\s*=\\s*('[^']*'|"[^"]*"|\`[^\`]*\`)`))
    return decl ? selectedColumns(decl[1], source) : null
  }
  const literal = trimmed.match(/^(['"`])([\s\S]*)\1$/)
  if (!literal) return null
  const body = literal[2].replace(/\$\{PROFILE_CHIP\}/g, PROFILE_CHIP)
  if (body.includes('${')) return null
  return columnsOf(body)
}

describe('profiles column allowlist', () => {
  it('matches the GRANTs in the migrations', () => {
    const ordered = Object.entries(migrations)
      .map(([path, sql]) => ({ version: Number(path.match(/\/(\d{3})_[^/]+\.sql$/)?.[1]), sql }))
      .filter((m) => Number.isFinite(m.version) && m.version >= FIRST_COLUMN_GRANT)
      .sort((a, b) => a.version - b.version)

    const granted = new Set<string>()
    const statement =
      /\b(GRANT|REVOKE)\s+SELECT\s*(?:\(([^)]*)\))?\s+ON\s+(?:TABLE\s+)?(?:public\.)?profiles\b/gi
    for (const { version, sql } of ordered) {
      // Comments quote statements (168's rollback line) that must not count.
      const code = sql.replace(/--[^\n]*/g, '')
      for (const [, verb, cols] of code.matchAll(statement)) {
        const isGrant = verb.toUpperCase() === 'GRANT'
        if (!cols) {
          // A table-wide GRANT would reopen every column; a table-wide REVOKE
          // closes them all.
          expect(isGrant, `${version}: table-wide GRANT SELECT on profiles`).toBe(false)
          granted.clear()
          continue
        }
        for (const col of columnsOf(cols)) {
          if (isGrant) granted.add(col)
          else granted.delete(col)
        }
      }
    }

    expect([...granted].sort()).toEqual([...PUBLIC].sort())
  })

  it('PROFILE_CHIP names granted columns only', () => {
    expect(columnsOf(PROFILE_CHIP).filter((col) => !PUBLIC.has(col))).toEqual([])
  })

  it('no profiles(*) embed anywhere in src/ or api/', () => {
    const star = /(?<![\w])profiles(?:!(?:\w+|\$\{\w+\}))*\s*\(\s*\*\s*\)/g
    const hits = [...app, ...api].flatMap(([path, source]) =>
      (source.match(star) ?? []).map((match) => `${path}: ${match}`)
    )
    expect(hits).toEqual([])
  })

  it('every profiles embed in src/ names granted columns only', () => {
    const embed = /(?<![\w])profiles(?:!(?:\w+|\$\{\w+\}))*\s*\(([^()]*)\)/g
    const bad: string[] = []
    for (const [path, source] of app) {
      for (const [match, inner] of source.matchAll(embed)) {
        const cols = columnsOf(inner.replace(/\$\{PROFILE_CHIP\}/g, PROFILE_CHIP))
        const outside = cols.filter((col) => !PUBLIC.has(col))
        if (outside.length) bad.push(`${path}: ${match} → ${outside.join(', ')}`)
      }
    }
    expect(bad).toEqual([])
  })

  it(".from('profiles') in src/ selects granted columns only", () => {
    const bad: string[] = []
    for (const [path, source] of app) {
      for (const from of source.matchAll(/\.from\(\s*['"]profiles['"]\s*\)/g)) {
        // The chain up to the end of the statement, or the next query.
        const rest = source.slice(from.index! + from[0].length)
        const end = rest.search(/;|\n\s*\n|\.from\(/)
        const chain = end === -1 ? rest : rest.slice(0, end)
        const selectArg = /\.select\(\s*('[^']*'|"[^"]*"|`[^`]*`|[A-Za-z_$][\w$]*)?/g
        for (const sel of chain.matchAll(selectArg)) {
          const arg = sel[1] ?? ''
          const cols = arg === '' ? null : selectedColumns(arg, source)
          if (!cols) {
            bad.push(`${path}: .select(${arg.trim()}) — not a readable column list`)
            continue
          }
          const outside = cols.filter((col) => !PUBLIC.has(col))
          if (outside.length) bad.push(`${path}: .select(${arg.trim()}) → ${outside.join(', ')}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})
