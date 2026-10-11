import { describe, expect, it, vi } from 'vitest'
import { createA11yStore } from '../core/store'

function setup(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial }
  const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) }
  const root = document.createElement('html')
  let t = 1000
  const store = createA11yStore({ storageKey: 'k' }, { storage, root, win: window, now: () => ++t })
  return { store, data, root }
}

describe('createA11yStore', () => {
  it('patches, paints, persists and notifies', () => {
    const { store, data, root } = setup()
    const listener = vi.fn()
    store.subscribe(listener)
    store.patch({ fontScale: 1.3, underlineLinks: true })
    expect(store.getSettings().fontScale).toBe(1.3)
    expect(root.style.fontSize).toBe('130%')
    expect(root.classList.contains('a11y-underline')).toBe(true)
    expect(JSON.parse(data.k).settings.fontScale).toBe(1.3)
    expect(store.getState().updatedAt).toBeGreaterThan(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the same state object for a no-op patch', () => {
    const { store } = setup()
    const before = store.getState()
    store.patch({ fontScale: 1 })
    expect(store.getState()).toBe(before)
  })

  it('stamps the owner set by the sync layer', () => {
    const { store } = setup()
    store.setOwner('user-1')
    store.patch({ bigTargets: true })
    expect(store.getState().owner).toBe('user-1')
  })

  it('adopts remote settings with their own timestamp', () => {
    const { store } = setup()
    store.adopt({ fontScale: 1.4 }, 42)
    expect(store.getState().updatedAt).toBe(42)
    expect(store.getSettings().fontScale).toBe(1.4)
  })

  it('device changes never move updatedAt', () => {
    const { store } = setup()
    store.patchDevice({ needs: ['dyslexia'] })
    expect(store.getState().updatedAt).toBe(0)
    expect(store.getState().device.needs).toEqual(['dyslexia'])
  })
})
