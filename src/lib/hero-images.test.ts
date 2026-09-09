import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HERO_IMAGES,
  PAGE_HERO_IMAGES,
  PHOTO_SETS,
  epochAt,
  heroImageFor,
  pageHeroFor,
} from './hero-images'

describe('pageHeroFor', () => {
  it('matches the page seeds used by the archive pages', () => {
    expect(PAGE_HERO_IMAGES.projects).toContain(pageHeroFor('projects', 'Project Archives'))
    expect(PAGE_HERO_IMAGES.events).toContain(pageHeroFor('events', 'Event Archives'))
    expect(PAGE_HERO_IMAGES.forums).toContain(pageHeroFor('forums', 'Community Forums'))
    expect(PAGE_HERO_IMAGES.resources).toContain(pageHeroFor('resources', 'Knowledge Base'))
    expect(PAGE_HERO_IMAGES.directory).toContain(pageHeroFor('directory', 'Network'))
    expect(PAGE_HERO_IMAGES.help).toContain(pageHeroFor('help', 'Help Center'))
    expect(PAGE_HERO_IMAGES.notFound).toContain(pageHeroFor('404', 'Error 404'))
  })

  it('matches collaboration tool seeds', () => {
    expect(PAGE_HERO_IMAGES.documents).toContain(pageHeroFor('documents', 'Collaboration Tools'))
    expect(PAGE_HERO_IMAGES.code).toContain(pageHeroFor('code', 'Collaboration Tools'))
    expect(PAGE_HERO_IMAGES.video).toContain(pageHeroFor('video', 'Collaboration Tools'))
    expect(PAGE_HERO_IMAGES.whiteboards).toContain(pageHeroFor('whiteboards', 'Collaboration Tools'))
    expect(PAGE_HERO_IMAGES.collaborate).toContain(pageHeroFor('collaborate', 'Collaboration'))
  })

  it('falls back to the eyebrow when the seed is an opaque id', () => {
    expect(PAGE_HERO_IMAGES.forums).toContain(
      pageHeroFor('3f1a9c0e-1111-2222-3333-444455556666', 'Forum Post'),
    )
  })

  it('falls back to the generic pool when nothing matches', () => {
    expect(HERO_IMAGES).toContain(pageHeroFor('zzz-qqq', 'Zzz Qqq'))
  })

  it('keeps card picks on the varied generic pool', () => {
    expect(HERO_IMAGES).toContain(heroImageFor('Project Alpha'))
  })

  it('rotates entities through a topic set and keeps each one stable', () => {
    // The point of the sets: two forum threads look like forums, not like each
    // other. A single-photo topic could not pass this, which is why the old
    // one-file-per-slot mapping went away.
    //
    // Opaque ids, not `thread-1`: a seed carrying the word "thread" matches the
    // forums rule itself, which makes it the topic rather than the thing, and
    // every such page would sit on the Forums landing frame.
    const id = (i: number) => `3f1a9c0e-1111-2222-3333-${String(i).padStart(12, '0')}`
    const seen = new Set(Array.from({ length: 40 }, (_, i) => pageHeroFor(id(i), 'Forum Post')))
    expect(seen.size).toBeGreaterThan(1)
    for (const photo of seen) expect(PAGE_HERO_IMAGES.forums).toContain(photo)
    expect(pageHeroFor(id(7), 'Forum Post')).toBe(pageHeroFor(id(7), 'Forum Post'))
  })

  it('gives each landing page its own frame within its set', () => {
    // A landing page names its own topic, so it never rotates — which is only
    // worth anything if two landing pages sharing a set get different frames.
    expect(pageHeroFor('institutions', 'Institutions')).not.toBe(
      pageHeroFor('events', 'Event Archives'),
    )
    expect(pageHeroFor('projects', 'Project Archives')).not.toBe(
      pageHeroFor('whiteboards', 'Collaboration Tools'),
    )
    expect(pageHeroFor('forums', 'Community Forums')).not.toBe(
      pageHeroFor('help', 'Help Center'),
    )
  })
})

describe('daily rotation', () => {
  const DAY = 24 * 60 * 60 * 1000

  /** Re-imports the module with the clock moved, since it samples time once. */
  const onDay = async (day: number) => {
    vi.resetModules()
    vi.setSystemTime(new Date(day * DAY))
    return (await import('./hero-images')) as typeof import('./hero-images')
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('counts whole days', () => {
    expect(epochAt(0)).toBe(0)
    expect(epochAt(DAY - 1)).toBe(0)
    expect(epochAt(DAY)).toBe(1)
    expect(epochAt(DAY * 3.5)).toBe(3)
  })

  it('moves a landing page onto a different photo the next day', async () => {
    vi.useFakeTimers()
    const day0 = await onDay(0)
    const day1 = await onDay(1)
    expect(day1.pageHeroFor('events', 'Event Archives')).not.toBe(
      day0.pageHeroFor('events', 'Event Archives'),
    )
    // Still a keynote photo, just the next one along.
    expect(day1.PHOTO_SETS.keynote).toContain(day1.pageHeroFor('events', 'Event Archives'))
  })

  it('holds one photo for the whole of a day', async () => {
    vi.useFakeTimers()
    const start = await onDay(3)
    const first = start.pageHeroFor('events', 'Event Archives')
    vi.setSystemTime(new Date(3 * DAY + DAY - 1))
    // Same module instance, clock advanced to the last millisecond of the day:
    // the rotation is sampled at load, so nothing may move underneath a reader.
    expect(start.pageHeroFor('events', 'Event Archives')).toBe(first)
  })

  it('walks a landing page through every frame in its set and back', async () => {
    vi.useFakeTimers()
    const set = PHOTO_SETS.keynote
    const seen = new Set<string>()
    for (let day = 0; day < set.length; day++) {
      const mod = await onDay(day)
      seen.add(mod.pageHeroFor('events', 'Event Archives'))
    }
    expect(seen.size).toBe(set.length)
    const wrapped = await onDay(set.length)
    const start = await onDay(0)
    expect(wrapped.pageHeroFor('events', 'Event Archives')).toBe(
      start.pageHeroFor('events', 'Event Archives'),
    )
  })

  it('keeps two landing pages in one set apart as they rotate', async () => {
    vi.useFakeTimers()
    for (let day = 0; day < 6; day++) {
      const mod = await onDay(day)
      expect(mod.pageHeroFor('events', 'Event Archives'), `day ${day}`).not.toBe(
        mod.pageHeroFor('institutions', 'Institutions'),
      )
    }
  })
})

describe('photo sets', () => {
  it('puts every photo in exactly one set and every set in the generic pool', () => {
    const all = Object.values(PHOTO_SETS).flat()
    expect(new Set(all).size).toBe(all.length)
    expect([...HERO_IMAGES].sort()).toEqual([...all].sort())
  })

  it('points every topic at a set that has room to rotate', () => {
    for (const [topic, set] of Object.entries(PAGE_HERO_IMAGES)) {
      expect(set.length, topic).toBeGreaterThanOrEqual(4)
    }
  })
})
