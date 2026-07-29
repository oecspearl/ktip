import { describe, it, expect, vi, beforeEach } from 'vitest'

// The RPC caller reaches for the Supabase singleton at import time, which
// throws without env vars. Stub the module, not the network.
const rpc = vi.fn()
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: any[]) => rpc(...args) } }))

const { mergeScores, resolveSort, rankRows, personalizedHref, hasSignals } = await import(
  './personalization'
)

const rows = (...ids: string[]) => ids.map((id) => ({ id, title: id }))

describe('mergeScores', () => {
  it('orders by score descending', () => {
    const out = mergeScores(rows('a', 'b', 'c'), [
      { id: 'a', score: 10, reasons: [] },
      { id: 'b', score: 90, reasons: [] },
      { id: 'c', score: 50, reasons: [] },
    ])
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('attaches score and reasons to the matching row', () => {
    const reasons = [{ code: 'topic', label: 'Matches your topics: climate', w: 25 }]
    const out = mergeScores(rows('a'), [{ id: 'a', score: 25, reasons }])
    expect(out[0].match_score).toBe(25)
    expect(out[0].match_reasons).toEqual(reasons)
  })

  it('preserves incoming order for tied scores, so refetches do not flicker', () => {
    const out = mergeScores(rows('a', 'b', 'c'), [
      { id: 'a', score: 5, reasons: [] },
      { id: 'b', score: 5, reasons: [] },
      { id: 'c', score: 5, reasons: [] },
    ])
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the input untouched and in order when nothing was scored', () => {
    const input = rows('a', 'b', 'c')
    expect(mergeScores(input, []).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(mergeScores(input, null).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(mergeScores(input, undefined)).toBe(input)
  })

  it('keeps unscored rows, last and in their original relative order', () => {
    // "rank, never hide": partial RPC coverage must not drop rows.
    const out = mergeScores(rows('a', 'b', 'c', 'd', 'e'), [
      { id: 'd', score: 40, reasons: [] },
      { id: 'b', score: 80, reasons: [] },
    ])
    expect(out.map((r) => r.id)).toEqual(['b', 'd', 'a', 'c', 'e'])
    expect(out).toHaveLength(5)
  })

  it('keeps a negatively scored row ahead of unscored ones rather than dropping it', () => {
    const out = mergeScores(rows('a', 'b'), [{ id: 'b', score: -40, reasons: [] }])
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('ignores score rows that match nothing on the page', () => {
    const out = mergeScores(rows('a'), [{ id: 'zzz', score: 99, reasons: [] }])
    expect(out.map((r) => r.id)).toEqual(['a'])
    expect(out[0].match_score).toBeUndefined()
  })
})

describe('resolveSort', () => {
  it('defaults to For You only when personalization is active', () => {
    expect(resolveSort(null, true, 'newest')).toBe('for_you')
    expect(resolveSort(null, false, 'newest')).toBe('newest')
    expect(resolveSort(undefined, false, 'deadline')).toBe('deadline')
  })

  it('lets an explicit choice win over the default', () => {
    expect(resolveSort('newest', true, 'newest')).toBe('newest')
    expect(resolveSort('deadline', true, 'newest')).toBe('deadline')
  })

  it('falls back when For You is requested but unavailable', () => {
    expect(resolveSort('for_you', false, 'deadline')).toBe('deadline')
    expect(resolveSort('for_you', true, 'deadline')).toBe('for_you')
  })

  it('treats an unrecognised param like an absent one', () => {
    expect(resolveSort('garbage', true, 'deadline')).toBe('for_you')
    expect(resolveSort('garbage', false, 'deadline')).toBe('deadline')
  })
})

describe('rankRows', () => {
  // Braced: mockReset() returns the mock, and a function returned from
  // beforeEach is treated as a teardown callback — vitest would then call the
  // mock after every test.
  beforeEach(() => {
    rpc.mockReset()
  })

  it('returns rows unchanged when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } })
    const input = rows('a', 'b')
    expect(await rankRows('project', input)).toBe(input)
  })

  it('returns rows unchanged when the RPC throws', async () => {
    rpc.mockRejectedValue(new Error('offline'))
    const input = rows('a', 'b')
    expect(await rankRows('project', input)).toBe(input)
  })

  it('returns rows unchanged when personalization is off (empty result)', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const input = rows('a', 'b')
    expect(await rankRows('grant', input)).toBe(input)
  })

  it('does not call the RPC for an empty page', async () => {
    expect(await rankRows('event', [])).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends at most 300 ids, because the RPC rejects more', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await rankRows('resource', rows(...Array.from({ length: 420 }, (_, i) => `id-${i}`)))
    expect(rpc.mock.calls[0][1].p_ids).toHaveLength(300)
    expect(rpc.mock.calls[0][1].p_entity).toBe('resource')
  })

  it('re-sorts by the returned scores', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'a', score: 1, reasons: [] },
        { id: 'b', score: 100, reasons: [] },
      ],
      error: null,
    })
    const out = await rankRows('project', rows('a', 'b'))
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('personalizedHref', () => {
  it('maps every rankable entity to its detail route', () => {
    expect(personalizedHref('project', 'x')).toBe('/projects/x')
    expect(personalizedHref('resource', 'x')).toBe('/resources/x')
    expect(personalizedHref('event', 'x')).toBe('/events/x')
    expect(personalizedHref('grant', 'x')).toBe('/grants/x')
  })
})

describe('hasSignals', () => {
  it('is false when the ranker has nothing to work with', () => {
    expect(hasSignals(null, null)).toBe(false)
    expect(
      hasSignals(
        { topics: [], categories: [], content_types: [] },
        { interests: [], skills: [], industry: null }
      )
    ).toBe(false)
  })

  it('is true once any explicit pick exists', () => {
    expect(hasSignals({ topics: ['climate'] }, null)).toBe(true)
    expect(hasSignals({ categories: ['agriculture'] }, null)).toBe(true)
    expect(hasSignals({ content_types: ['grant:startup'] }, null)).toBe(true)
  })

  it('is true once any profile field exists', () => {
    expect(hasSignals(null, { interests: ['AgriTech'] })).toBe(true)
    expect(hasSignals(null, { skills: ['Data Science'] })).toBe(true)
    expect(hasSignals(null, { industry: 'Manufacturing' })).toBe(true)
  })
})
