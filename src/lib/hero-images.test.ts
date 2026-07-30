import { describe, expect, it } from 'vitest'
import { HERO_IMAGES, PAGE_HERO_IMAGES, heroImageFor, pageHeroFor } from './hero-images'

describe('pageHeroFor', () => {
  it('matches the page seeds used by the archive pages', () => {
    expect(pageHeroFor('projects', 'Project Archives')).toBe(PAGE_HERO_IMAGES.projects)
    expect(pageHeroFor('events', 'Event Archives')).toBe(PAGE_HERO_IMAGES.events)
    expect(pageHeroFor('forums', 'Community Forums')).toBe(PAGE_HERO_IMAGES.forums)
    expect(pageHeroFor('resources', 'Knowledge Base')).toBe(PAGE_HERO_IMAGES.resources)
    expect(pageHeroFor('directory', 'Network')).toBe(PAGE_HERO_IMAGES.directory)
    expect(pageHeroFor('help', 'Help Center')).toBe(PAGE_HERO_IMAGES.help)
    expect(pageHeroFor('404', 'Error 404')).toBe(PAGE_HERO_IMAGES.notFound)
  })

  it('matches collaboration tool seeds', () => {
    expect(pageHeroFor('documents', 'Collaboration Tools')).toBe(PAGE_HERO_IMAGES.documents)
    expect(pageHeroFor('code', 'Collaboration Tools')).toBe(PAGE_HERO_IMAGES.code)
    expect(pageHeroFor('video', 'Collaboration Tools')).toBe(PAGE_HERO_IMAGES.video)
    expect(pageHeroFor('whiteboards', 'Collaboration Tools')).toBe(PAGE_HERO_IMAGES.whiteboards)
    expect(pageHeroFor('collaborate', 'Collaboration')).toBe(PAGE_HERO_IMAGES.collaborate)
  })

  it('falls back to the eyebrow when the seed is an opaque id', () => {
    expect(pageHeroFor('3f1a9c0e-1111-2222-3333-444455556666', 'Forum Post')).toBe(
      PAGE_HERO_IMAGES.forums,
    )
  })

  it('falls back to the generic pool when nothing matches', () => {
    expect(HERO_IMAGES).toContain(pageHeroFor('zzz-qqq', 'Zzz Qqq'))
  })

  it('keeps card picks on the varied generic pool', () => {
    expect(HERO_IMAGES).toContain(heroImageFor('Project Alpha'))
  })
})
