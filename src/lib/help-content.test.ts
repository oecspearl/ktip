import { describe, expect, it } from 'vitest'
import { HELP_CATEGORIES, GETTING_STARTED_GUIDES, countHelpArticles, searchHelpContent } from './help-content'
import type { HelpCategory } from './help/types'

const CATEGORIES: HelpCategory[] = [
  {
    id: 'funding',
    title: 'Funding Opportunities',
    description: 'Find and apply for funding.',
    icon: 'Banknote',
    articles: [
      { id: 'a1', title: 'How do I apply?', content: 'Open the wizard.', tags: ['apply'] },
      { id: 'a2', title: 'Who can apply?', content: 'Registered founders.', tags: ['eligibility'] },
    ],
  },
  {
    id: 'safety',
    title: 'Safety',
    description: 'Reporting and blocking.',
    icon: 'Shield',
    articles: [{ id: 'b1', title: 'Block someone', content: 'Open their profile.', tags: ['block'] }],
  },
]

describe('searchHelpContent', () => {
  it('hands back every category untouched with no query', () => {
    expect(searchHelpContent(CATEGORIES, '', '')).toEqual(CATEGORIES)
  })

  it('keeps a whole category when the query names it', () => {
    const [only] = searchHelpContent(CATEGORIES, 'funding', '')
    expect(only.id).toBe('funding')
    // Both articles survive, though neither says "funding" in its own text.
    expect(only.articles).toHaveLength(2)
  })

  it('matches a category by its description too', () => {
    const ids = searchHelpContent(CATEGORIES, 'blocking', '').map((c) => c.id)
    expect(ids).toEqual(['safety'])
  })

  it('falls through to article title, body and tags', () => {
    expect(searchHelpContent(CATEGORIES, 'wizard', '')[0].articles.map((a) => a.id)).toEqual(['a1'])
    expect(searchHelpContent(CATEGORIES, 'eligibility', '')[0].articles.map((a) => a.id)).toEqual(['a2'])
  })

  it('drops categories with nothing left and is case-insensitive', () => {
    expect(searchHelpContent(CATEGORIES, 'ZZZ', '')).toEqual([])
    expect(searchHelpContent(CATEGORIES, 'FOUNDERS', '')[0].articles.map((a) => a.id)).toEqual(['a2'])
  })

  it('honours the category filter alongside the query', () => {
    expect(searchHelpContent(CATEGORIES, 'apply', 'safety')).toEqual([])
    expect(searchHelpContent(CATEGORIES, '', 'safety').map((c) => c.id)).toEqual(['safety'])
  })
})

describe('the shipped catalogue', () => {
  it('counts every article', () => {
    expect(countHelpArticles(CATEGORIES)).toBe(3)
    expect(countHelpArticles(HELP_CATEGORIES)).toBeGreaterThan(0)
  })

  // Article ids are the targets behind /help?article=<id> and are flat-mapped
  // into the global search index, so a duplicate silently steals a deep link.
  it('has globally unique article ids', () => {
    const ids = HELP_CATEGORIES.flatMap((c) => c.articles.map((a) => a.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique category ids', () => {
    const ids = HELP_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // HelpRoleQuickStart indexes guides by role and falls back to the first one,
  // so a duplicate role would make a chip unreachable.
  it('has one quick-start guide per role, each with steps and links', () => {
    const roles = GETTING_STARTED_GUIDES.map((g) => g.role)
    expect(new Set(roles).size).toBe(roles.length)
    for (const guide of GETTING_STARTED_GUIDES) {
      expect(guide.steps.length).toBeGreaterThan(0)
      expect(guide.quickLinks.length).toBeGreaterThan(0)
    }
  })
})
