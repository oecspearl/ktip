import { describe, expect, it } from 'vitest'
import { categoryHref, categoryTrail, listTrail, type CategoryTrailInput } from './category-crumbs'

interface Row {
  id: string
  title: string
  category: string | null
}

const categories = [
  { value: 'environment', label: 'Environment' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
]

const rows: Row[] = [
  { id: 'w', title: 'WaterSafe Montserrat', category: 'environment' },
  { id: 'r', title: 'ReefWatch AI', category: 'environment' },
  { id: 's', title: 'SolarGrid Antigua', category: 'environment' },
  { id: 'c', title: 'CareRoute', category: 'healthcare' },
]

const input = (over: Partial<CategoryTrailInput<Row>> = {}): CategoryTrailInput<Row> => ({
  home: 'Home',
  section: { label: 'Projects', href: '/projects' },
  param: 'category',
  categories,
  current: { id: 'r', title: 'ReefWatch AI', category: 'environment' },
  items: rows,
  categoryOf: (r) => r.category,
  idOf: (r) => r.id,
  titleOf: (r) => r.title,
  pathOf: (r) => `/projects/${r.id}`,
  seeAll: (n) => `See all ${n}`,
  ...over,
})

describe('categoryHref', () => {
  it('builds the filtered list address', () => {
    expect(categoryHref('/events', 'type', 'demo_day')).toBe('/events?type=demo_day')
  })
})

describe('categoryTrail', () => {
  it('runs Home, section, category, item', () => {
    const trail = categoryTrail(input())
    expect(trail.map((c) => c.label)).toEqual(['Home', 'Projects', 'Environment', 'ReefWatch AI'])
    expect(trail[0].menu).toBeNull()
    expect(trail[1].menu).toBeUndefined()
    expect(trail[2].href).toBe('/projects?category=environment')
  })

  it('lists the categories that have items, with counts, marking the current one', () => {
    const menu = categoryTrail(input())[2].menu!
    expect(menu.map((e) => [e.name, e.count, !!e.current])).toEqual([
      ['Environment', 3, true],
      ['Healthcare', 1, false],
    ])
    expect(menu[1].href).toBe('/projects?category=healthcare')
  })

  it('lists the other items in the category, marking the reader’s own', () => {
    const menu = categoryTrail(input())[3].menu!
    expect(menu.map((e) => e.name)).toEqual(['WaterSafe Montserrat', 'ReefWatch AI', 'SolarGrid Antigua'])
    expect(menu.find((e) => e.current)?.href).toBe('/projects/r')
  })

  it('tags each item open or closed when the kind has that state', () => {
    const menu = categoryTrail(
      input({ badgeOf: (r) => (r.id === 's' ? { label: 'Closed', tone: 'closed' } : { label: 'Open', tone: 'open' }) })
    )[3].menu!
    expect(menu.map((e) => e.badge?.tone)).toEqual(['open', 'open', 'closed'])
    expect(menu.map((e) => !!e.folded)).toEqual([false, false, true])
    expect(categoryTrail(input())[3].menu!.every((e) => e.badge === undefined)).toBe(true)
  })

  it('puts open items first and folds the closed ones', () => {
    const menu = categoryTrail(
      input({ badgeOf: (r) => (r.id === 'w' ? { label: 'Closed', tone: 'closed' } : { label: 'Open', tone: 'open' }) })
    )[3].menu!
    expect(menu.map((e) => [e.name, !!e.folded])).toEqual([
      ['ReefWatch AI', false],
      ['SolarGrid Antigua', false],
      ['WaterSafe Montserrat', true],
    ])
  })

  it('caps open and closed separately, so past items cannot crowd out open ones', () => {
    const many: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, category: 'environment' }))
    const menu = categoryTrail(
      input({
        items: many,
        current: { id: 'p0', title: 'P0', category: 'environment' },
        limit: 3,
        badgeOf: (r) => (Number(r.id.slice(1)) >= 2 ? { label: 'Closed', tone: 'closed' } : { label: 'Open', tone: 'open' }),
      })
    )[3].menu!
    expect(menu.map((e) => e.name)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'See all 10'])
    expect(menu.filter((e) => e.folded).map((e) => e.name)).toEqual(['P2', 'P3', 'P4'])
  })

  it('caps a long category, keeps the reader’s item, and ends with See all', () => {
    const many: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, title: `P${i}`, category: 'environment' }))
    const menu = categoryTrail(
      input({ items: many, current: { id: 'p11', title: 'P11', category: 'environment' }, limit: 5 })
    )[3].menu!
    expect(menu.map((e) => e.name)).toEqual(['P0', 'P1', 'P2', 'P3', 'P11', 'See all 12'])
    expect(menu[5].href).toBe('/projects?category=environment')
  })

  it('offers every category without counts while the list loads', () => {
    const trail = categoryTrail(input({ items: undefined }))
    expect(trail[2].menu!.map((e) => e.count)).toEqual([undefined, undefined, undefined])
    expect(trail[3].menu).toBeNull()
  })

  it('skips the category step for an item outside the vocabulary', () => {
    const trail = categoryTrail(input({ current: { id: 'x', title: 'Odd one', category: 'space' } }))
    expect(trail.map((c) => c.label)).toEqual(['Home', 'Projects', 'Odd one'])
    expect(trail[2].menu).toBeNull()
  })
})

describe('listTrail', () => {
  const base = {
    home: 'Home',
    section: { label: 'Events', href: '/events', currentLabel: 'Events List' },
    param: 'type',
    categories: [
      { value: 'hackathon', label: 'Hackathon' },
      { value: 'workshop', label: 'Workshop' },
    ],
  }

  it('is Home › section when nothing is filtered', () => {
    const trail = listTrail({ ...base, selected: '' })
    expect(trail.map((c) => c.label)).toEqual(['Home', 'Events List'])
    expect(trail[1].href).toBeUndefined()
  })

  it('adds the category, with the other categories in its menu', () => {
    const trail = listTrail({ ...base, selected: 'workshop' })
    expect(trail.map((c) => c.label)).toEqual(['Home', 'Events', 'Workshop'])
    expect(trail[1].href).toBe('/events')
    expect(trail[2].menu!.map((e) => [e.href, !!e.current])).toEqual([
      ['/events?type=hackathon', false],
      ['/events?type=workshop', true],
    ])
  })

  it('ignores a filter value outside the vocabulary', () => {
    expect(listTrail({ ...base, selected: 'rave' }).map((c) => c.label)).toEqual(['Home', 'Events List'])
  })
})
