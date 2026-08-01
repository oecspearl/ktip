import { describe, it, expect } from 'vitest'
import { entityPath, forumPostPath, isUuid, memberPath, slugify } from './slug'

const UUID = '4a6da97b-1872-44a6-8993-bb2c0cc82c4a'

describe('isUuid', () => {
  it('recognises a uuid route param, whatever its case', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid(UUID.toUpperCase())).toBe(true)
  })

  it('treats a slug as a slug', () => {
    expect(isUuid('oecs-blue-economy-innovation-fund')).toBe(false)
    // A slug that merely contains hex and dashes is still not a uuid.
    expect(isUuid('4a6da97b-1872')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})

describe('slugify', () => {
  it('kebab-cases and drops punctuation', () => {
    expect(slugify('OECS Blue Economy Innovation Fund')).toBe(
      'oecs-blue-economy-innovation-fund'
    )
  })

  it('folds accents rather than dropping the letter', () => {
    expect(slugify('Café Grant')).toBe('cafe-grant')
  })

  it('never returns an empty segment', () => {
    expect(slugify('!!!')).toBe('item')
    expect(slugify(null)).toBe('item')
  })
})

describe('entityPath', () => {
  it('prefers the slug the database assigned', () => {
    expect(entityPath('grant', { id: UUID, slug: 'blue-economy-fund' })).toBe(
      '/grants/blue-economy-fund'
    )
    expect(entityPath('event', { id: UUID, slug: 'oecs-climathon' })).toBe(
      '/events/oecs-climathon'
    )
  })

  it('falls back to the uuid, so an unslugged row still links', () => {
    expect(entityPath('project', { id: UUID })).toBe(`/projects/${UUID}`)
    expect(entityPath('resource', { id: UUID, slug: null })).toBe(`/resources/${UUID}`)
    expect(entityPath('grant', { id: UUID, slug: '' })).toBe(`/grants/${UUID}`)
  })
})

describe('memberPath and forumPostPath', () => {
  it('uses the username when there is one', () => {
    expect(memberPath({ id: UUID, username: 'delon-pierre' })).toBe('/user/delon-pierre')
    expect(memberPath({ id: UUID })).toBe(`/user/${UUID}`)
  })

  it('keeps the board segment and slugs only the post', () => {
    expect(forumPostPath('showcase', { id: UUID, slug: 'my-first-build' })).toBe(
      '/forums/showcase/my-first-build'
    )
    expect(forumPostPath('showcase', { id: UUID })).toBe(`/forums/showcase/${UUID}`)
  })
})
