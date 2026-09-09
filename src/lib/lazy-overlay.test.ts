import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadOrNothing } from './lazy-overlay'

vi.mock('./monitoring', () => ({ captureException: vi.fn() }))
const { captureException } = await import('./monitoring')

const Panel = () => null

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(captureException).mockClear()
})

describe('loadOrNothing', () => {
  it('returns the module when the import succeeds', async () => {
    const load = vi.fn().mockResolvedValue({ default: Panel })

    await expect(loadOrNothing(load, 'test', [])).resolves.toEqual({ default: Panel })
    expect(load).toHaveBeenCalledTimes(1)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('retries a transient failure and reports nothing when it recovers', async () => {
    // Vite re-optimising its dependency cache refuses module requests for a
    // moment. That is the whole failure this exists for, and it must not reach
    // the reader at all.
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: Panel })

    await expect(loadOrNothing(load, 'test', [0, 0])).resolves.toEqual({ default: Panel })
    expect(load).toHaveBeenCalledTimes(2)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('never rejects — a chunk that stays gone degrades to a component that renders nothing', async () => {
    // The point of the whole module. A rejection here reaches React.lazy, which
    // caches it and throws it on every subsequent render, and the app-wide
    // AppErrorBoundary turns that into "Something went wrong" for the entire
    // site because one optional overlay could not be fetched.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi.fn().mockRejectedValue(new Error('404'))

    const mod = await loadOrNothing(load, 'sticky-notes', [0, 0])

    expect(load).toHaveBeenCalledTimes(3)
    expect((mod.default as () => null)()).toBeNull()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('reports the failure under the chunk-load code, with the area that failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('404')

    await loadOrNothing(vi.fn().mockRejectedValue(cause), 'sticky-notes', [])

    const reported = vi.mocked(captureException).mock.calls[0][0] as {
      code: string
      area: string
      cause: unknown
    }
    expect(reported.code).toBe('ROUTE_IMPORT_FAILED')
    expect(reported.area).toBe('sticky-notes')
    expect(reported.cause).toBe(cause)
  })
})
