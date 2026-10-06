import { describe, it, expect } from 'vitest'
import { errorMessage, settleEach, splitReturned } from './bulk'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('settleEach', () => {
  it('runs every item and reports the failures without throwing', async () => {
    const result = await settleEach(['a', 'b', 'c'], async (item) => {
      if (item === 'b') throw { message: 'permission denied for table events' }
    })
    expect(result.done).toEqual(['a', 'c'])
    expect(result.failed).toEqual([{ item: 'b', message: 'permission denied for table events' }])
  })

  it('keeps input order even when jobs finish out of order', async () => {
    const delays: Record<string, number> = { a: 30, b: 0, c: 15, d: 5 }
    const result = await settleEach(['a', 'b', 'c', 'd'], (item) => wait(delays[item]), { concurrency: 4 })
    expect(result.done).toEqual(['a', 'b', 'c', 'd'])
  })

  it('never has more jobs in flight than the cap', async () => {
    let inFlight = 0
    let peak = 0
    await settleEach([1, 2, 3, 4, 5, 6, 7], async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await wait(2)
      inFlight--
    }, { concurrency: 2 })
    expect(peak).toBe(2)
  })

  it('reports progress once per item', async () => {
    const seen: string[] = []
    await settleEach(['a', 'b', 'c'], async () => {}, {
      onProgress: (finished, total) => seen.push(`${finished}/${total}`),
    })
    expect(seen).toEqual(['1/3', '2/3', '3/3'])
  })

  it('returns an empty split for an empty list', async () => {
    expect(await settleEach([], async () => {})).toEqual({ done: [], failed: [] })
  })
})

describe('splitReturned', () => {
  it('treats an id the update did not return as refused', () => {
    const result = splitReturned(['a', 'b', 'c'], [{ id: 'c' }, { id: 'a' }], 'not changed')
    expect(result.done).toEqual(['a', 'c'])
    expect(result.failed).toEqual([{ item: 'b', message: 'not changed' }])
  })

  it('treats a null response as every id refused', () => {
    expect(splitReturned(['a'], null, 'x').failed).toHaveLength(1)
  })
})

describe('errorMessage', () => {
  it('reads the message off a PostgREST error object', () => {
    expect(errorMessage({ code: '42501', message: 'new row violates row-level security' })).toBe(
      'new row violates row-level security'
    )
  })

  it('falls back to the string form', () => {
    expect(errorMessage('boom')).toBe('boom')
  })
})
