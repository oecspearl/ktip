import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request, peek, prefetch, subscribe, resetBatcher } from './batcher'
import { clearLocal, resetLocalCacheProbe } from './local-cache'

// Everything worth defending here is a negative: N components asking for the
// same string make ONE wire item, a second render makes NO request at all, and
// a failed fetch never rejects onto a render path.

function mockFetch(
  translate: (text: string) => string = (t) => `[fr] ${t}`,
  extra: Record<string, unknown> = {}
) {
  const bodies: { to: string; items: { i: number; t: string; f: string }[] }[] = []
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as (typeof bodies)[number]
    bodies.push(body)
    const results: Record<string, { t: string; cached: boolean }> = {}
    for (const item of body.items) results[String(item.i)] = { t: translate(item.t), cached: false }
    return {
      ok: true,
      json: async () => ({ to: body.to, results, ...extra }),
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fn)
  return { fn, bodies }
}

beforeEach(() => {
  vi.useFakeTimers()
  resetBatcher()
  resetLocalCacheProbe()
  clearLocal()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/**
 * Advance past the 50 ms window and let the fetch promise chain settle.
 *
 * Drained in several passes rather than one. `send()` awaits fetch, then
 * `res.json()`, then resolves each caller — a chain of microtasks that a single
 * `advanceTimersByTimeAsync` does not reliably exhaust when the machine is busy
 * running the other 60 test files. One pass passed in isolation and failed in
 * the full suite, which is the worst kind of test.
 */
async function flush() {
  for (let i = 0; i < 4; i++) {
    await vi.advanceTimersByTimeAsync(60)
    await Promise.resolve()
  }
}

describe('batcher — one request per frame, not one per string', () => {
  it('collapses three requests inside the window into a single POST', async () => {
    const { fn, bodies } = mockFetch()

    const pending = Promise.all([
      request('Solar irrigation', 'text', 'fr'),
      request('Community workshop', 'text', 'fr'),
      request('Grant deadline extended', 'text', 'fr'),
    ])
    await flush()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(bodies[0].items).toHaveLength(3)
    await expect(pending).resolves.toEqual([
      '[fr] Solar irrigation',
      '[fr] Community workshop',
      '[fr] Grant deadline extended',
    ])
  })

  it('sends one wire item for a string two components both asked for', async () => {
    const { fn, bodies } = mockFetch()

    const a = request('Community workshop', 'text', 'fr')
    const b = request('Community workshop', 'text', 'fr')
    await flush()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(bodies[0].items).toHaveLength(1)
    // Both callers still get their answer.
    await expect(a).resolves.toBe('[fr] Community workshop')
    await expect(b).resolves.toBe('[fr] Community workshop')
  })

  it('splits a batch past the item ceiling into more than one POST', async () => {
    const { fn } = mockFetch()

    const texts = Array.from({ length: 250 }, (_, i) => `Distinct project title number ${i}`)
    const all = Promise.all(texts.map((t) => request(t, 'text', 'fr')))
    await flush()
    await flush()

    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
    const answers = await all
    expect(answers[0]).toBe('[fr] Distinct project title number 0')
    expect(answers[249]).toBe('[fr] Distinct project title number 249')
  })

  it('keeps the same bytes as text and as html apart', async () => {
    // Markup translated as html keeps its tags; translated as text it does not.
    // They are two different answers, so they must be two wire items and two
    // cache entries — deduping them into one is a silent corruption.
    const { bodies } = mockFetch()
    void request('<p>Solar irrigation</p>', 'html', 'fr')
    void request('<p>Solar irrigation</p>', 'text', 'fr')
    await flush()

    expect(bodies[0].items).toHaveLength(2)
    expect(bodies[0].items.map((i) => i.f).sort()).toEqual(['html', 'text'])
  })
})

describe('batcher — the cache tiers', () => {
  it('answers a second render from memory with no further request', async () => {
    const { fn } = mockFetch()

    void request('Solar irrigation', 'text', 'fr')
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)

    await expect(request('Solar irrigation', 'text', 'fr')).resolves.toBe('[fr] Solar irrigation')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('peek is synchronous, so a known string renders on the first paint', async () => {
    mockFetch()
    expect(peek('Solar irrigation', 'text', 'fr')).toBeUndefined()

    void request('Solar irrigation', 'text', 'fr')
    await flush()

    expect(peek('Solar irrigation', 'text', 'fr')).toBe('[fr] Solar irrigation')
  })

  it('survives a page reload through localStorage', async () => {
    const first = mockFetch()
    void request('Solar irrigation', 'text', 'fr')
    await flush()
    expect(first.fn).toHaveBeenCalledTimes(1)

    // A new page load: memory is gone, localStorage is not.
    resetBatcher()
    const second = mockFetch()

    expect(peek('Solar irrigation', 'text', 'fr')).toBe('[fr] Solar irrigation')
    await expect(request('Solar irrigation', 'text', 'fr')).resolves.toBe('[fr] Solar irrigation')
    expect(second.fn).not.toHaveBeenCalled()
  })

  it('keeps languages apart', async () => {
    mockFetch((t) => `[fr] ${t}`)
    void request('Solar irrigation', 'text', 'fr')
    await flush()

    expect(peek('Solar irrigation', 'text', 'fr')).toBe('[fr] Solar irrigation')
    expect(peek('Solar irrigation', 'text', 'es')).toBeUndefined()
  })
})

describe('batcher — never rejects, never blanks the page', () => {
  it('resolves with the source when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )

    const a = request('Solar irrigation', 'text', 'fr')
    const b = request('Community workshop', 'text', 'fr')
    await flush()

    await expect(a).resolves.toBe('Solar irrigation')
    await expect(b).resolves.toBe('Community workshop')
  })

  it('resolves with the source on a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response))
    const a = request('Solar irrigation', 'text', 'fr')
    await flush()
    await expect(a).resolves.toBe('Solar irrigation')
  })

  it('does not persist a degraded answer', async () => {
    // The server echoed the source because it had no key. Caching that would
    // leave this device stuck on English long after the key was added.
    mockFetch((t) => t, { degraded: 'no_key' })

    void request('Solar irrigation', 'text', 'fr')
    await flush()

    resetBatcher()
    const second = mockFetch()
    expect(peek('Solar irrigation', 'text', 'fr')).toBeUndefined()

    void request('Solar irrigation', 'text', 'fr')
    await flush()
    expect(second.fn).toHaveBeenCalledTimes(1)
  })

  it('backs off after a retryAfter and answers from source meanwhile', async () => {
    const throttled = mockFetch((t) => t, { degraded: 'rate_limited', retryAfter: 300 })
    void request('Solar irrigation', 'text', 'fr')
    await flush()
    expect(throttled.fn).toHaveBeenCalledTimes(1)

    // A different string, still inside the back-off window: no second call.
    await expect(request('Community workshop', 'text', 'fr')).resolves.toBe('Community workshop')
    await flush()
    expect(throttled.fn).toHaveBeenCalledTimes(1)
  })
})

describe('batcher — what never reaches the wire', () => {
  it('short-circuits English without touching the network', async () => {
    const { fn } = mockFetch()
    await expect(request('Solar irrigation', 'text', 'en')).resolves.toBe('Solar irrigation')
    await flush()
    expect(fn).not.toHaveBeenCalled()
  })

  it.each(['https://oecsinnovation.org', '2026-08-02', 'KTIP', '#0ea5e9', ''])(
    'never sends %j',
    async (text) => {
      const { fn } = mockFetch()
      await expect(request(text, 'text', 'fr')).resolves.toBe(text)
      await flush()
      expect(fn).not.toHaveBeenCalled()
    }
  )
})

describe('batcher — subscribers', () => {
  it('wakes subscribers once a batch actually changed something', async () => {
    mockFetch()
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    void request('Solar irrigation', 'text', 'fr')
    await flush()

    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('does not wake subscribers when nothing changed', async () => {
    // Every answer identical to its source: there is nothing to repaint, and a
    // notify here would re-render the whole tree for no reason.
    mockFetch((t) => t, { degraded: 'no_key' })
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    void request('Solar irrigation', 'text', 'fr')
    await flush()

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})

describe('batcher — prefetch', () => {
  it('warms the cache so a later render is instant', async () => {
    const { fn } = mockFetch()
    prefetch(['Solar irrigation', 'Community workshop'], 'text', 'fr')
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)

    expect(peek('Solar irrigation', 'text', 'fr')).toBe('[fr] Solar irrigation')
    await expect(request('Community workshop', 'text', 'fr')).resolves.toBe('[fr] Community workshop')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
