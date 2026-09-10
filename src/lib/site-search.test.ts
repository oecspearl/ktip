import { describe, it, expect } from 'vitest'
// Read as text (Vite ?raw) rather than through node:fs, so the test typechecks
// under tsconfig.app.json, which only pulls in vite/client types.
import appSource from '../App.tsx?raw'
import {
  applyAiRanking,
  filterByAccess,
  groupRows,
  localSearch,
  scoreMatch,
  toRow,
  type SearchRow,
} from './site-search'
import { ALL_ENTRIES, SITE_MAP, SITE_MAP_COMPACT, SITE_ENTRY_IDS, type SiteEntry } from './site-map'

const entry = (over: Partial<SiteEntry> = {}): SiteEntry => ({
  id: 'test',
  title: 'Create a project',
  category: 'Projects',
  description: 'Publish a new innovation project',
  keywords: ['new project', 'submit idea'],
  ...over,
})

describe('scoreMatch', () => {
  it('returns 0 when nothing matches', () => {
    expect(scoreMatch('quantum tunnelling', entry())).toBe(0)
  })

  it('keeps every entry for an empty query', () => {
    expect(scoreMatch('   ', entry())).toBeGreaterThan(0)
  })

  it('ranks exact above prefix above substring above subsequence', () => {
    const target = entry({ title: 'Grants', keywords: [], description: '' })
    const exact = scoreMatch('grants', target)
    const prefix = scoreMatch('gran', target)
    const substring = scoreMatch('rant', target)
    const subsequence = scoreMatch('gts', target)

    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(subsequence)
    expect(subsequence).toBeGreaterThan(0)
  })

  it('matches on keywords when the title misses', () => {
    expect(scoreMatch('submit idea', entry())).toBeGreaterThan(0)
  })

  it('matches multi-word prefixes out of order in the title', () => {
    expect(scoreMatch('proj crea', entry())).toBeGreaterThan(0)
  })
})

describe('localSearch', () => {
  it('finds "Create a project" from a partial query', () => {
    const results = localSearch('new proj', SITE_MAP)
    expect(results.map((r) => r.id)).toContain('projects.new')
  })

  it('finds the security settings from "password"', () => {
    const results = localSearch('password', SITE_MAP)
    expect(results.map((r) => r.id)).toContain('account.password')
  })

  it('finds dark mode from "night mode"', () => {
    const results = localSearch('night mode', SITE_MAP)
    expect(results.map((r) => r.id)).toContain('theme.dark-mode')
  })

  it('drops entries that do not match at all', () => {
    expect(localSearch('zzzqqq', SITE_MAP)).toHaveLength(0)
  })
})

describe('filterByAccess', () => {
  const entries = [
    entry({ id: 'public', access: 'public' }),
    entry({ id: 'guest', access: 'guest' }),
    entry({ id: 'auth', access: 'auth' }),
    entry({ id: 'oecs', access: 'oecs' }),
  ]

  it('shows public and guest entries to anonymous viewers', () => {
    const ids = filterByAccess(entries, { signedIn: false, isOecs: false }).map((e) => e.id)
    expect(ids).toEqual(['public', 'guest'])
  })

  it('shows public and auth entries to members', () => {
    const ids = filterByAccess(entries, { signedIn: true, isOecs: false }).map((e) => e.id)
    expect(ids).toEqual(['public', 'auth'])
  })

  it('adds admin entries for OECS administrators', () => {
    const ids = filterByAccess(entries, { signedIn: true, isOecs: true }).map((e) => e.id)
    expect(ids).toEqual(['public', 'auth', 'oecs'])
  })

  it('hides every admin route from a signed-out visitor', () => {
    const visible = filterByAccess(SITE_MAP, { signedIn: false, isOecs: false })
    expect(visible.some((e) => e.href?.startsWith('/admin'))).toBe(false)
  })

  it('hides a capability-gated row from a member who lacks the capability', () => {
    // A student cannot host an event; the panel must not offer /events/new.
    const ids = filterByAccess(SITE_MAP, { signedIn: true, isOecs: false, can: () => false }).map((e) => e.id)
    expect(ids).not.toContain('events.new')
    expect(ids).not.toContain('projects.new')
    expect(ids).not.toContain('grants.post')
  })

  it('keeps a capability-gated row for a member who holds the capability', () => {
    const can = (k: string) => k === 'event:create'
    const ids = filterByAccess(SITE_MAP, { signedIn: true, isOecs: false, can }).map((e) => e.id)
    expect(ids).toContain('events.new')
    expect(ids).not.toContain('projects.new')
  })

  it('keeps capability-gated rows for a signed-out visitor only through the access level', () => {
    // 'auth' rows are hidden signed out regardless; the capability layer never
    // applies to a visitor, whose CTAs route to login.
    const ids = filterByAccess(SITE_MAP, { signedIn: false, isOecs: false, can: () => false }).map((e) => e.id)
    expect(ids).not.toContain('events.new')
    expect(ids).toContain('discover')
  })

  it('shows the business profile and Chamber rows only to organisation accounts', () => {
    const person = filterByAccess(SITE_MAP, { signedIn: true, isOecs: false, isOrgAccount: false }).map((e) => e.id)
    const org = filterByAccess(SITE_MAP, { signedIn: true, isOecs: false, isOrgAccount: true }).map((e) => e.id)
    expect(person).not.toContain('org.profile')
    expect(person).not.toContain('org.chamber-verification')
    expect(org).toContain('org.profile')
    expect(org).toContain('org.chamber-verification')
  })

  it('keeps every row for a caller that only knows the coarse levels', () => {
    // Older callers pass no `can`; behaviour for them is unchanged.
    const ids = filterByAccess(SITE_MAP, { signedIn: true, isOecs: false }).map((e) => e.id)
    expect(ids).toContain('events.new')
    expect(ids).toContain('org.profile')
  })
})

describe('applyAiRanking', () => {
  const rows: SearchRow[] = ['a', 'b', 'c'].map((id) => toRow(entry({ id })))

  it('moves the AI-ranked ids to the front, in order', () => {
    expect(applyAiRanking(rows, ['c', 'a']).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('leaves rows untouched when the AI returned nothing', () => {
    expect(applyAiRanking(rows, []).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('ignores ids that are not in the row list', () => {
    expect(applyAiRanking(rows, ['nope', 'b']).map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('groupRows', () => {
  it('orders sections and drops empty ones', () => {
    const rows: SearchRow[] = [
      { id: '1', kind: 'project', title: 'p', description: '', category: 'Projects' },
      { id: '2', kind: 'place', title: 'a', description: '', category: 'Projects' },
      { id: '3', kind: 'member', title: 'm', description: '', category: 'Directory' },
    ]
    expect(groupRows(rows).map((g) => g.kind)).toEqual(['place', 'project', 'member'])
  })
})

describe('SITE_MAP integrity', () => {
  it('has unique ids across site entries and help articles', () => {
    const ids = ALL_ENTRIES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(SITE_ENTRY_IDS.size).toBe(ids.length)
  })

  it('gives every entry a title, description and at least one keyword', () => {
    for (const e of ALL_ENTRIES) {
      expect(e.title.length, e.id).toBeGreaterThan(0)
      expect(e.description.length, e.id).toBeGreaterThan(0)
      expect(e.keywords.length, e.id).toBeGreaterThan(0)
    }
  })

  it('gives every entry either a destination or instructions', () => {
    for (const e of ALL_ENTRIES) {
      expect(!!e.href || !!e.howTo?.length, e.id).toBe(true)
    }
  })

  it('only points at routes that exist in App.tsx', () => {
    const matches = Array.from((appSource as string).matchAll(/path:\s*'([^']+)'/g))
    const routes = new Set(matches.map((m) => m[1]))

    for (const e of ALL_ENTRIES) {
      if (!e.href) continue
      const path = e.href.split('?')[0]
      expect(routes.has(path), `${e.id} → ${path}`).toBe(true)
    }
  })

  it('serialises one compact line per entry for the AI prompt', () => {
    const lines = SITE_MAP_COMPACT.split('\n')
    expect(lines).toHaveLength(ALL_ENTRIES.length)
    expect(lines.every((line) => line.split('|').length >= 4)).toBe(true)
    // Bodies of help articles must never reach the prompt — keep it small.
    // 87 page entries (~7.8k chars) plus one title-only line per help article
    // (~16k chars across 132 of them). The ceiling is set well above that but
    // far below what a leaked body would add, which is the regression this
    // guards: article bodies average ~900 characters, so letting even a
    // handful through would clear this by thousands rather than by tens.
    //
    // Raised from 24k when the Help Center gained its two-step verification
    // and portrait articles. Adding an article is expected and costs ~120
    // characters; if this ceiling is ever hit again, check first that it is
    // titles growing and not a body that has escaped into the serialiser.
    expect(SITE_MAP_COMPACT.length).toBeLessThan(28_000)
  })
})
