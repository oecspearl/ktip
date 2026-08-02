import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampGhostOpacity,
  GHOST_DEFAULTS,
  GHOST_MIN_OPACITY,
  getGhostPrefs,
  readGhostPrefs,
  resetGhostPrefs,
  setGhostPrefs,
  subscribeGhostPrefs,
} from './ghost-mode'

afterEach(() => {
  window.localStorage.clear()
  resetGhostPrefs()
})

describe('clampGhostOpacity', () => {
  it('keeps a ghost faint but never gone', () => {
    expect(clampGhostOpacity(0)).toBe(GHOST_MIN_OPACITY)
    expect(clampGhostOpacity(-3)).toBe(GHOST_MIN_OPACITY)
    expect(clampGhostOpacity(2)).toBe(1)
    expect(clampGhostOpacity(0.35)).toBe(0.35)
  })

  it('falls back rather than writing NaN into a style', () => {
    expect(clampGhostOpacity(NaN)).toBe(GHOST_DEFAULTS.opacity)
    expect(clampGhostOpacity(Infinity)).toBe(GHOST_DEFAULTS.opacity)
  })
})

describe('readGhostPrefs', () => {
  it('defaults to fading at 20%', () => {
    expect(readGhostPrefs()).toEqual({ enabled: true, opacity: 0.2 })
  })

  it('survives an unparseable or half-written store', () => {
    window.localStorage.setItem('ktip_ghost_mode', 'not json')
    expect(readGhostPrefs()).toEqual(GHOST_DEFAULTS)

    window.localStorage.setItem('ktip_ghost_mode', JSON.stringify({ opacity: 'thin' }))
    expect(readGhostPrefs()).toEqual(GHOST_DEFAULTS)

    window.localStorage.setItem('ktip_ghost_mode', JSON.stringify({ enabled: false }))
    expect(readGhostPrefs()).toEqual({ enabled: false, opacity: GHOST_DEFAULTS.opacity })
  })

  it('clamps a stored value that is out of range', () => {
    window.localStorage.setItem('ktip_ghost_mode', JSON.stringify({ enabled: true, opacity: 0 }))
    expect(readGhostPrefs().opacity).toBe(GHOST_MIN_OPACITY)
  })
})

describe('the store', () => {
  it('persists a change and hands back the same object until the next write', () => {
    const before = getGhostPrefs()
    setGhostPrefs({ opacity: 0.5 })
    expect(getGhostPrefs()).not.toBe(before)
    expect(getGhostPrefs()).toEqual({ enabled: true, opacity: 0.5 })
    expect(readGhostPrefs()).toEqual({ enabled: true, opacity: 0.5 })
    // Identity has to hold across reads, or useSyncExternalStore loops.
    expect(getGhostPrefs()).toBe(getGhostPrefs())
  })

  it('tells every surface at once', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeGhostPrefs(listener)
    setGhostPrefs({ enabled: false })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setGhostPrefs({ enabled: true })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when nothing actually changed', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeGhostPrefs(listener)
    setGhostPrefs({ opacity: GHOST_DEFAULTS.opacity })
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('clamps on the way in, so a bad caller cannot hide a surface outright', () => {
    setGhostPrefs({ opacity: 0 })
    expect(getGhostPrefs().opacity).toBe(GHOST_MIN_OPACITY)
  })
})
