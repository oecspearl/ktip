import { describe, expect, it } from 'vitest'
import {
  AUTO_RELOAD_WINDOW_MS,
  WORKER_RESET_WINDOW_MS,
  chooseRouteLoadRecovery,
  claimAutoReload,
  claimWorkerReset,
} from './route-reload'

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

describe('claimWorkerReset', () => {
  it('allows one reset, then none until its longer window has passed', () => {
    const store = memoryStore()
    expect(claimWorkerReset(1_000_000, store)).toBe(true)
    expect(claimWorkerReset(1_000_000 + AUTO_RELOAD_WINDOW_MS, store)).toBe(false)
    expect(claimWorkerReset(1_000_000 + WORKER_RESET_WINDOW_MS, store)).toBe(true)
  })

  it('keeps its own claim, separate from the reload', () => {
    const store = memoryStore()
    expect(claimAutoReload(1_000_000, store)).toBe(true)
    expect(claimWorkerReset(1_000_000, store)).toBe(true)
  })
})

describe('chooseRouteLoadRecovery', () => {
  const online = { online: true, controlled: true }

  it('reloads first, resets the worker second, shows the screen third', () => {
    const store = memoryStore()
    expect(chooseRouteLoadRecovery({ ...online, now: 1_000_000, store })).toBe('reload')
    expect(chooseRouteLoadRecovery({ ...online, now: 1_005_000, store })).toBe('reset-worker')
    expect(chooseRouteLoadRecovery({ ...online, now: 1_010_000, store })).toBe('show-screen')
  })

  it('skips the reset on a page no service worker controls', () => {
    const store = memoryStore()
    expect(chooseRouteLoadRecovery({ online: true, controlled: false, now: 1_000_000, store })).toBe('reload')
    expect(chooseRouteLoadRecovery({ online: true, controlled: false, now: 1_005_000, store })).toBe('show-screen')
  })

  it('cannot alternate reload and reset into a loop', () => {
    const store = memoryStore()
    const steps = Array.from({ length: 10 }, (_, i) =>
      chooseRouteLoadRecovery({ ...online, now: 1_000_000 + i * 20_000, store })
    )
    // One reload per 30 s window is allowed, but the reset happens once in 5 min.
    expect(steps.filter((step) => step === 'reset-worker')).toHaveLength(1)
  })

  it('goes straight to the screen offline, keeping both claims for later', () => {
    const store = memoryStore()
    expect(chooseRouteLoadRecovery({ online: false, controlled: true, now: 1_000_000, store })).toBe('show-screen')
    expect(chooseRouteLoadRecovery({ ...online, now: 1_001_000, store })).toBe('reload')
  })
})
