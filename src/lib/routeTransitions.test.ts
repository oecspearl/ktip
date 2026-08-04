import { describe, expect, it } from 'vitest'
import { resolveTargetPath, sameShell, shellKey } from './routeTransitions'

describe('resolveTargetPath', () => {
  it('keeps an absolute target', () => {
    expect(resolveTargetPath('/directory', '/projects')).toBe('/projects')
    expect(resolveTargetPath('/directory', '/directory?member=x')).toBe('/directory')
  })

  it('resolves search-only and hash-only targets to the current page', () => {
    // What setSearchParams navigates with — closing the member drawer strips
    // `?member=` this way and must not deal a card shuffle.
    expect(resolveTargetPath('/directory', '?member=andre')).toBe('/directory')
    expect(resolveTargetPath('/directory', '?')).toBe('/directory')
    expect(resolveTargetPath('/directory', '')).toBe('/directory')
    expect(resolveTargetPath('/help', '#faq')).toBe('/help')
  })
})

describe('shellKey', () => {
  it('collapses one-segment dashboard tab paths to the shell', () => {
    expect(shellKey('/dashboard')).toBe('/dashboard')
    expect(shellKey('/dashboard/achievements')).toBe('/dashboard')
    expect(shellKey('/dashboard/leaderboard')).toBe('/dashboard')
    expect(shellKey('/dashboard/submissions')).toBe('/dashboard')
    expect(shellKey('/dashboard/business/')).toBe('/dashboard')
  })

  it('leaves the full-page receipt outside the shell', () => {
    expect(shellKey('/dashboard/submissions/abc')).toBe('/dashboard/submissions/abc')
  })

  it('collapses every admin path to the admin shell', () => {
    expect(shellKey('/admin')).toBe('/admin')
    expect(shellKey('/admin/errors/simulate')).toBe('/admin')
  })

  it('is the identity elsewhere', () => {
    expect(shellKey('/')).toBe('/')
    expect(shellKey('/projects')).toBe('/projects')
    expect(shellKey('/leaderboard')).toBe('/leaderboard')
    expect(shellKey('/administrator')).toBe('/administrator')
  })
})

describe('sameShell', () => {
  it('is true for tab changes inside one shell', () => {
    expect(sameShell('/dashboard', '/dashboard/achievements')).toBe(true)
    expect(sameShell('/dashboard/achievements', '/dashboard/leaderboard')).toBe(true)
    expect(sameShell('/admin', '/admin/errors/simulate')).toBe(true)
  })

  it('is false across shells and for non-shell pages', () => {
    expect(sameShell('/projects', '/dashboard')).toBe(false)
    expect(sameShell('/dashboard', '/admin')).toBe(false)
    expect(sameShell('/dashboard/submissions', '/dashboard/submissions/abc')).toBe(false)
    // Identical non-shell paths are the samePage opt-out's job, not this one's.
    expect(sameShell('/projects', '/projects')).toBe(false)
  })
})
