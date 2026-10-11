import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type StoredState } from '../core/config'
import { decideSync, isSyncedBlob, toBlob, type SyncedBlob } from '../core/sync'

const blob = (updatedAt: number): SyncedBlob => ({ v: 2, updatedAt, settings: {} })
const local = (updatedAt: number, owner: string | null = null) => ({ updatedAt, owner })

describe('decideSync', () => {
  it('pushes local changes to an account that has none', () => {
    expect(decideSync(local(10), 'u1', null)).toBe('push')
    expect(decideSync(local(0), 'u1', null)).toBe('none')
  })

  it('lets the newer side win', () => {
    expect(decideSync(local(10, 'u1'), 'u1', blob(20))).toBe('adopt')
    expect(decideSync(local(30, 'u1'), 'u1', blob(20))).toBe('push')
    expect(decideSync(local(20, 'u1'), 'u1', blob(20))).toBe('none')
  })

  it('keeps settings chosen while signed out', () => {
    expect(decideSync(local(30, null), 'u1', blob(20))).toBe('push')
  })

  it("never pushes another account's settings on a shared device", () => {
    expect(decideSync(local(30, 'someone-else'), 'u1', blob(20))).toBe('adopt')
    expect(decideSync(local(30, 'someone-else'), 'u1', null)).toBe('none')
  })
})

describe('blob helpers', () => {
  it('round-trips state and never carries device data', () => {
    const state: StoredState = {
      v: 2,
      updatedAt: 9,
      owner: 'u1',
      settings: DEFAULT_SETTINGS,
      device: { needs: ['lowVision'], ttsVoice: {}, voiceConsentAt: null },
    }
    const b = toBlob(state, 'dark')
    expect(isSyncedBlob(b)).toBe(true)
    expect(b.theme).toBe('dark')
    expect(JSON.stringify(b)).not.toContain('lowVision')
    expect(JSON.stringify(b)).not.toContain('owner')
  })

  it('rejects other shapes', () => {
    expect(isSyncedBlob({ fontScale: 1 })).toBe(false)
    expect(isSyncedBlob(null)).toBe(false)
  })
})
