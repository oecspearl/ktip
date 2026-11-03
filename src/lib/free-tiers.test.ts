import { describe, it, expect } from 'vitest'
import {
  FREE_TIERS,
  meterStatus,
  percentUsed,
  readMeter,
  resolveFreeTiers,
  usageForTier,
  type UsageMeters,
} from './free-tiers'

const tier = (id: string) => FREE_TIERS.find((t) => t.id === id)!

describe('free tier limits', () => {
  it('carries the published free allowances', () => {
    expect(tier('livekit_concurrent').limit).toBe(100)
    expect(tier('translator_chars').limit).toBe(2_000_000)
    expect(tier('speech_translation_seconds').limit).toBe(5 * 3600)
    expect(tier('tts_chars').limit).toBe(500_000)
  })

  it('gives every tier its own env override key', () => {
    const keys = FREE_TIERS.map((t) => t.envKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key.startsWith('VITE_FREE_TIER_')).toBe(true)
  })

  it('applies a positive override and ignores anything else', () => {
    const tiers = resolveFreeTiers({
      VITE_FREE_TIER_TRANSLATOR_CHARS: '5000000',
      VITE_FREE_TIER_LIVEKIT_CONCURRENT: '0',
      VITE_FREE_TIER_TTS_CHARS: 'lots',
    })
    const byId = Object.fromEntries(tiers.map((t) => [t.id, t.limit]))
    expect(byId.translator_chars).toBe(5_000_000)
    expect(byId.livekit_concurrent).toBe(100)
    expect(byId.tts_chars).toBe(500_000)
  })

  it('does not mutate the shared defaults when overriding', () => {
    resolveFreeTiers({ VITE_FREE_TIER_TRANSLATOR_CHARS: '9' })
    expect(tier('translator_chars').limit).toBe(2_000_000)
  })
})

describe('percentUsed', () => {
  it('is a plain percentage and is not clamped', () => {
    expect(percentUsed(50, 100)).toBe(50)
    expect(percentUsed(130, 100)).toBe(130)
  })

  it('is zero for nothing used, a missing limit or junk input', () => {
    expect(percentUsed(0, 100)).toBe(0)
    expect(percentUsed(10, 0)).toBe(0)
    expect(percentUsed(Number.NaN, 100)).toBe(0)
    expect(percentUsed(-5, 100)).toBe(0)
  })
})

describe('meterStatus', () => {
  it('is ok below 70%', () => {
    expect(meterStatus(0, 100)).toBe('ok')
    expect(meterStatus(69.9, 100)).toBe('ok')
  })

  it('warns from 70% up to the cap', () => {
    expect(meterStatus(70, 100)).toBe('warn')
    expect(meterStatus(99.9, 100)).toBe('warn')
  })

  it('is over once the cap is reached', () => {
    expect(meterStatus(100, 100)).toBe('over')
    expect(meterStatus(250, 100)).toBe('over')
  })
})

describe('readMeter', () => {
  it('treats null and negative usage as zero', () => {
    expect(readMeter(tier('tts_chars'), null).used).toBe(0)
    expect(readMeter(tier('tts_chars'), -3).status).toBe('ok')
  })

  it('reports the status at the tier limit', () => {
    const reading = readMeter(tier('livekit_concurrent'), 85)
    expect(reading.percent).toBe(85)
    expect(reading.status).toBe('warn')
  })
})

describe('usageForTier', () => {
  const meters = (overrides: Partial<UsageMeters> = {}): UsageMeters => ({
    month_start: '2026-11-01T00:00:00Z',
    kinds: {
      translate_chars: { all_events: 1000, this_event: 400 },
      caption_chars: { all_events: 500, this_event: 100 },
      speech_seconds: { all_events: 90, this_event: 90 },
    },
    site_translate_chars: null,
    team_file_bytes: 0,
    calls_now: 7,
    ...overrides,
  })

  it('reads people in calls for the concurrency cap', () => {
    expect(usageForTier('livekit_concurrent', meters())).toBe(7)
  })

  it('adds chat and captions when there is no site-wide ledger', () => {
    expect(usageForTier('translator_chars', meters())).toBe(1500)
  })

  it('prefers the site-wide ledger, which also counts pages outside the venue', () => {
    expect(usageForTier('translator_chars', meters({ site_translate_chars: 90_000 }))).toBe(90_000)
  })

  it('never reports less than the venue itself measured', () => {
    expect(usageForTier('translator_chars', meters({ site_translate_chars: 10 }))).toBe(1500)
  })

  it('is zero for a kind nothing has written yet', () => {
    expect(usageForTier('tts_chars', meters())).toBe(0)
    expect(usageForTier('speech_translation_seconds', meters())).toBe(90)
  })
})
