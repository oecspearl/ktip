import { describe, expect, it } from 'vitest'
import { AUTO_RELOAD_WINDOW_MS, claimAutoReload } from './route-reload'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('claimAutoReload', () => {
  it('lets the first failure reload', () => {
    expect(claimAutoReload(1_000_000, memoryStore())).toBe(true)
  })

  it('refuses a second reload inside the window, so a stale shell cannot loop', () => {
    const store = memoryStore()
    expect(claimAutoReload(1_000_000, store)).toBe(true)
    expect(claimAutoReload(1_000_000 + 5_000, store)).toBe(false)
  })

  it('allows a reload again once the window has passed', () => {
    const store = memoryStore()
    expect(claimAutoReload(1_000_000, store)).toBe(true)
    expect(claimAutoReload(1_000_000 + AUTO_RELOAD_WINDOW_MS, store)).toBe(true)
  })

  it('treats a timestamp from the future (clock moved back) as stale', () => {
    const store = memoryStore()
    expect(claimAutoReload(2_000_000, store)).toBe(true)
    expect(claimAutoReload(1_000_000, store)).toBe(true)
  })

  it('never reloads when there is no storage to remember the claim', () => {
    expect(claimAutoReload(1_000_000, null)).toBe(false)
  })

  it('never reloads when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(claimAutoReload(1_000_000, broken)).toBe(false)
  })
})
