import { describe, it, expect, vi } from 'vitest'
import { translateBatch, type NewRow, type Provider, type TranslationStore } from './translate-core'
import { contentHash } from './hash'
import type { TranslateItem } from './protocol'

// A fake store that counts everything, because the properties worth defending
// here are about what did NOT happen: a fully cached batch must make zero budget
// claims and zero provider calls, a refused batch must make zero provider calls,
// and a `store: false` batch must write nothing at all.
function makeStore(overrides: Partial<TranslationStore> = {}) {
  const calls = { lookup: 0, save: 0, claim: 0, touch: 0, prune: 0 }
  const saved: NewRow[] = []
  const touched: { hashes: string[]; hits: number; misses: number }[] = []
  const store: TranslationStore = {
    async lookup() {
      calls.lookup++
      return []
    },
    async save(rows) {
      calls.save++
      saved.push(...rows)
    },
    async claimBudget() {
      calls.claim++
      return { allowed: true }
    },
    async touch(hashes, _lang, hits, misses) {
      calls.touch++
      touched.push({ hashes, hits, misses })
    },
    async prune() {
      calls.prune++
    },
    ...overrides,
  }
  return { store, calls, saved, touched }
}

function makeProvider(overrides: Partial<Provider> = {}) {
  const seen: { texts: string[]; format: string }[] = []
  const provider: Provider = {
    id: 'fake',
    maxItemsPerCall: 100,
    maxCharsPerCall: 50_000,
    async translate(texts, _to, format) {
      seen.push({ texts, format })
      return texts.map((t) => ({ text: `[fr] ${t}`, detected: 'en' }))
    },
    ...overrides,
  }
  return { provider, seen }
}

const deps = (provider: Provider | null, store: TranslationStore | null, random = () => 1) => ({
  provider,
  store,
  signal: new AbortController().signal,
  random,
})

const items = (...texts: string[]): TranslateItem[] => texts.map((t, i) => ({ i, t }))

describe('translateBatch — the every-index contract', () => {
  // The client renders straight from this map. A missing key is a hole in the
  // page, so it is asserted on every path rather than on the happy one.
  const paths: [string, () => Promise<unknown>][] = [
    [
      'happy path',
      () => translateBatch('fr', items('Solar irrigation'), true, deps(makeProvider().provider, makeStore().store)),
    ],
    ['no provider', () => translateBatch('fr', items('Solar irrigation'), true, deps(null, makeStore().store))],
    ['no store', () => translateBatch('fr', items('Solar irrigation'), true, deps(makeProvider().provider, null))],
    [
      'over budget',
      () =>
        translateBatch(
          'fr',
          items('Solar irrigation'),
          true,
          deps(
            makeProvider().provider,
            makeStore({ async claimBudget() { return { allowed: false, reason: 'over_budget' as const } } }).store
          )
        ),
    ],
    [
      'provider throws',
      () =>
        translateBatch(
          'fr',
          items('Solar irrigation'),
          true,
          deps(
            makeProvider({ async translate() { throw new Error('boom') } }).provider,
            makeStore().store
          )
        ),
    ],
    [
      'lookup throws',
      () =>
        translateBatch(
          'fr',
          items('Solar irrigation'),
          true,
          deps(makeProvider().provider, makeStore({ async lookup() { throw new Error('down') } }).store)
        ),
    ],
    [
      'skipped as untranslatable',
      () => translateBatch('fr', items('https://oecsinnovation.org'), true, deps(makeProvider().provider, makeStore().store)),
    ],
  ]

  it.each(paths)('%s answers every requested index', async (_name, run) => {
    const res = (await run()) as { results: Record<string, { t: string }> }
    expect(Object.keys(res.results)).toEqual(['0'])
    expect(typeof res.results['0'].t).toBe('string')
    expect(res.results['0'].t.length).toBeGreaterThan(0)
  })

  it('answers every index of a mixed batch, translatable or not', async () => {
    const { provider } = makeProvider()
    const { store } = makeStore()
    const res = await translateBatch(
      'fr',
      [
        { i: 0, t: 'Solar irrigation' },
        { i: 1, t: 'https://example.org' },
        { i: 2, t: '2026-08-02' },
        { i: 3, t: 'Community workshop' },
      ],
      true,
      deps(provider, store)
    )
    expect(Object.keys(res.results).sort()).toEqual(['0', '1', '2', '3'])
    expect(res.results['0'].t).toBe('[fr] Solar irrigation')
    // Skipped items come back untouched rather than missing.
    expect(res.results['1'].t).toBe('https://example.org')
    expect(res.results['2'].t).toBe('2026-08-02')
  })

  it('preserves non-contiguous indices', async () => {
    const { provider } = makeProvider()
    const { store } = makeStore()
    const res = await translateBatch(
      'fr',
      [
        { i: 7, t: 'Solar irrigation' },
        { i: 42, t: 'Community workshop' },
      ],
      true,
      deps(provider, store)
    )
    expect(Object.keys(res.results).sort()).toEqual(['42', '7'])
    expect(res.results['42'].t).toBe('[fr] Community workshop')
  })
})

describe('translateBatch — the cache is what makes it free', () => {
  it('a fully cached batch costs zero provider calls and zero budget', async () => {
    const hash = await contentHash('Solar irrigation', 'text')
    const { provider, seen } = makeProvider()
    const { store, calls } = makeStore({
      async lookup() {
        return [{ hash, translated_text: 'Irrigation solaire', source_lang: 'en' }]
      },
    })

    const res = await translateBatch('fr', items('Solar irrigation'), true, deps(provider, store))

    expect(res.results['0']).toEqual({ t: 'Irrigation solaire', cached: true, from: 'en' })
    expect(seen).toHaveLength(0)
    expect(calls.claim).toBe(0)
    expect(calls.save).toBe(0)
    expect(res.degraded).toBeUndefined()
  })

  it('charges only the misses in a mixed batch', async () => {
    const hash = await contentHash('Solar irrigation', 'text')
    const { provider, seen } = makeProvider()
    const claimed: number[] = []
    const { store } = makeStore({
      async lookup() {
        return [{ hash, translated_text: 'Irrigation solaire' }]
      },
      async claimBudget(chars) {
        claimed.push(chars)
        return { allowed: true }
      },
    })

    await translateBatch('fr', items('Solar irrigation', 'Community workshop'), true, deps(provider, store))

    expect(seen).toHaveLength(1)
    expect(seen[0].texts).toEqual(['Community workshop'])
    // Only the miss, not the whole batch.
    expect(claimed).toEqual(['Community workshop'.length])
  })

  it('translates a repeated string once and answers both indices', async () => {
    const { provider, seen } = makeProvider()
    const claimed: number[] = []
    const { store, saved } = makeStore({
      async claimBudget(chars) {
        claimed.push(chars)
        return { allowed: true }
      },
    })

    const res = await translateBatch(
      'fr',
      items('Community workshop', 'Community workshop', 'Community workshop'),
      true,
      deps(provider, store)
    )

    expect(seen[0].texts).toEqual(['Community workshop'])
    expect(claimed).toEqual(['Community workshop'.length])
    expect(saved).toHaveLength(1)
    expect(res.results['0'].t).toBe('[fr] Community workshop')
    expect(res.results['2'].t).toBe('[fr] Community workshop')
  })

  it('records hits and misses for the metering table', async () => {
    const hash = await contentHash('Solar irrigation', 'text')
    const { provider } = makeProvider()
    const { store, touched } = makeStore({
      async lookup() {
        return [{ hash, translated_text: 'Irrigation solaire' }]
      },
    })

    await translateBatch('fr', items('Solar irrigation', 'Community workshop'), true, deps(provider, store))

    expect(touched).toHaveLength(1)
    expect(touched[0]).toMatchObject({ hits: 1, misses: 1 })
    expect(touched[0].hashes).toEqual([hash])
  })
})

describe('translateBatch — degradation is invisible, never fatal', () => {
  it('falls back to source with no_key when no provider is configured', async () => {
    const { store, calls } = makeStore()
    const res = await translateBatch('fr', items('Solar irrigation'), true, deps(null, store))
    expect(res.degraded).toBe('no_key')
    expect(res.results['0'].t).toBe('Solar irrigation')
    expect(calls.claim).toBe(0)
  })

  it('declines rather than translating uncapped when the store is unreachable', async () => {
    const { provider, seen } = makeProvider()
    const res = await translateBatch('fr', items('Solar irrigation'), true, deps(provider, null))
    expect(res.degraded).toBe('store_unavailable')
    expect(res.results['0'].t).toBe('Solar irrigation')
    // The point: no ledger means no spending.
    expect(seen).toHaveLength(0)
  })

  it('serves cache hits translated even when the budget is exhausted', async () => {
    const hash = await contentHash('Solar irrigation', 'text')
    const { provider, seen } = makeProvider()
    const { store } = makeStore({
      async lookup() {
        return [{ hash, translated_text: 'Irrigation solaire' }]
      },
      async claimBudget() {
        return { allowed: false, reason: 'over_budget' as const }
      },
    })

    const res = await translateBatch('fr', items('Solar irrigation', 'Community workshop'), true, deps(provider, store))

    expect(res.degraded).toBe('over_budget')
    // Already paid for — still French.
    expect(res.results['0'].t).toBe('Irrigation solaire')
    // Not paid for — English, not blank.
    expect(res.results['1'].t).toBe('Community workshop')
    expect(seen).toHaveLength(0)
  })

  it('passes retryAfter through when throttled', async () => {
    const { provider } = makeProvider()
    const { store } = makeStore({
      async claimBudget() {
        return { allowed: false, reason: 'rate_limited' as const, retry_after: 300 }
      },
    })
    const res = await translateBatch('fr', items('Solar irrigation'), true, deps(provider, store))
    expect(res.degraded).toBe('rate_limited')
    expect(res.retryAfter).toBe(300)
  })

  it('reports a provider 429 as rate_limited with its retryAfter', async () => {
    const err = Object.assign(new Error('slow down'), { retryAfter: 42 })
    const { provider } = makeProvider({
      async translate() {
        throw err
      },
    })
    const { store } = makeStore()
    const res = await translateBatch('fr', items('Solar irrigation'), true, deps(provider, store))
    expect(res.degraded).toBe('rate_limited')
    expect(res.retryAfter).toBe(42)
  })

  it('survives a save failure without degrading the answer', async () => {
    const { provider } = makeProvider()
    const { store } = makeStore({
      async save() {
        throw new Error('write failed')
      },
    })
    const res = await translateBatch('fr', items('Solar irrigation'), true, deps(provider, store))
    expect(res.degraded).toBeUndefined()
    expect(res.results['0'].t).toBe('[fr] Solar irrigation')
  })

  it('treats a short provider response as missing, never as shifted', async () => {
    // A ragged answer that got paired positionally would put one card's text
    // under another card's title — far worse than leaving it in English.
    const { provider } = makeProvider({
      async translate() {
        return [{ text: '[fr] first' }]
      },
    })
    const { store } = makeStore()
    const res = await translateBatch('fr', items('Solar irrigation', 'Community workshop'), true, deps(provider, store))
    expect(res.results['0'].t).toBe('[fr] first')
    expect(res.results['1'].t).toBe('Community workshop')
  })
})

describe('translateBatch — storage and formats', () => {
  it('writes nothing when store is false', async () => {
    const { provider, seen } = makeProvider()
    const { store, saved, calls } = makeStore()
    const res = await translateBatch('fr', items('A private note'), false, deps(provider, store))

    // It still translates — the private path just leaves no trace.
    expect(seen).toHaveLength(1)
    expect(res.results['0'].t).toBe('[fr] A private note')
    expect(saved).toHaveLength(0)
    expect(calls.save).toBe(0)
  })

  it('sends text and html as separate provider calls', async () => {
    const { provider, seen } = makeProvider()
    const { store } = makeStore()
    await translateBatch(
      'fr',
      [
        { i: 0, t: 'Solar irrigation', f: 'text' },
        { i: 1, t: '<p>Community workshop</p>', f: 'html' },
      ],
      true,
      deps(provider, store)
    )
    expect(seen).toHaveLength(2)
    expect(seen.map((s) => s.format).sort()).toEqual(['html', 'text'])
  })

  it('chunks a batch past the provider item limit', async () => {
    const { provider, seen } = makeProvider({ maxItemsPerCall: 2 })
    const { store } = makeStore()
    await translateBatch('fr', items('Alpha one', 'Beta two', 'Gamma three', 'Delta four', 'Epsilon five'), true, deps(provider, store))
    expect(seen).toHaveLength(3)
    expect(seen.map((s) => s.texts.length)).toEqual([2, 2, 1])
  })

  it('chunks on characters as well as count', async () => {
    const { provider, seen } = makeProvider({ maxCharsPerCall: 100 })
    const { store } = makeStore()
    // 0.9 * 100 = 90 characters of headroom per call.
    await translateBatch('fr', items('a'.repeat(60) + ' x', 'b'.repeat(60) + ' y'), true, deps(provider, store))
    expect(seen).toHaveLength(2)
  })

  it('keeps the source when the provider says it is already in the target language', async () => {
    const { provider } = makeProvider({
      async translate(texts) {
        return texts.map(() => ({ text: 'reworded French', detected: 'fr' }))
      },
    })
    const { store, saved } = makeStore()
    const res = await translateBatch('fr', items('Irrigation solaire pour les fermes'), true, deps(provider, store))
    expect(res.results['0'].t).toBe('Irrigation solaire pour les fermes')
    expect(saved[0].translated_text).toBe('Irrigation solaire pour les fermes')
  })

  it('runs the eviction sweep only on the sampled fraction of requests', async () => {
    const { provider } = makeProvider()
    const never = makeStore()
    await translateBatch('fr', items('Solar irrigation'), true, deps(provider, never.store, () => 0.5))
    expect(never.calls.prune).toBe(0)

    const always = makeStore()
    await translateBatch('fr', items('Solar irrigation'), true, deps(provider, always.store, () => 0))
    expect(always.calls.prune).toBe(1)
  })

  it('makes no calls at all when nothing in the batch is translatable', async () => {
    const { provider, seen } = makeProvider()
    const { store, calls } = makeStore()
    const res = await translateBatch('fr', items('https://example.org', '2026-08-02', 'KTIP'), true, deps(provider, store))
    expect(seen).toHaveLength(0)
    expect(calls.lookup).toBe(0)
    expect(calls.claim).toBe(0)
    expect(calls.touch).toBe(0)
    expect(res.results['0'].t).toBe('https://example.org')
  })
})

describe('translateBatch — normalisation reaches the cache key', () => {
  it('a padded string hits the row stored for its trimmed form', async () => {
    const hash = await contentHash('Solar irrigation', 'text')
    const lookedUp: string[][] = []
    const { provider, seen } = makeProvider()
    const { store } = makeStore({
      async lookup(hashes) {
        lookedUp.push(hashes)
        return [{ hash, translated_text: 'Irrigation solaire' }]
      },
    })

    const res = await translateBatch('fr', [{ i: 0, t: '   Solar   irrigation  ' }], true, deps(provider, store))

    expect(lookedUp[0]).toEqual([hash])
    expect(res.results['0'].cached).toBe(true)
    expect(seen).toHaveLength(0)
  })

  it('stores the normalised source, not the raw input', async () => {
    const { provider } = makeProvider()
    const { store, saved } = makeStore()
    await translateBatch('fr', [{ i: 0, t: '  Community   workshop  ' }], true, deps(provider, store))
    expect(saved[0].source_text).toBe('Community workshop')
  })
})

describe('translateBatch — an empty batch', () => {
  it('does nothing and returns an empty map', async () => {
    const { provider, seen } = makeProvider()
    const { store, calls } = makeStore()
    const spy = vi.spyOn(store, 'lookup')
    const res = await translateBatch('fr', [], true, deps(provider, store))
    expect(res.results).toEqual({})
    expect(seen).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
    expect(calls.claim).toBe(0)
  })
})
