// @vitest-environment node
//
// Node, not jsdom — this exercises the edge runtime's module, and stubbing
// `fetch` is simpler without jsdom's own fetch polyfill in the mix.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  catalogBaseUrl,
  enrollInKtipCourse,
  KtipCatalogUnavailableError,
  loadKtipCatalog,
  normalizeKtipEnrollResult,
} from '../../../api/_lib/ktip-catalog'

/** Gives vi.fn a real (url, init) signature so mock.calls indexes as [url, init]. */
type FetchArgs = [string, RequestInit?]

const DEFAULT_BASE = 'https://commons.oecscampus.org'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('catalogBaseUrl', () => {
  it('defaults to commons.oecscampus.org when unset', () => {
    vi.stubEnv('KTIP_CATALOG_BASE_URL', '')
    expect(catalogBaseUrl()).toBe(DEFAULT_BASE)
  })

  it('accepts a valid https override', () => {
    vi.stubEnv('KTIP_CATALOG_BASE_URL', 'https://commons.oecscampus.org')
    expect(catalogBaseUrl()).toBe('https://commons.oecscampus.org')
  })

  it('strips a trailing slash', () => {
    vi.stubEnv('KTIP_CATALOG_BASE_URL', 'https://commons.oecscampus.org/')
    expect(catalogBaseUrl()).toBe('https://commons.oecscampus.org')
  })

  it('falls back to the default for a malformed override', () => {
    vi.stubEnv('KTIP_CATALOG_BASE_URL', 'https://.oecscampus.org')
    expect(catalogBaseUrl()).toBe(DEFAULT_BASE)
  })

  it('falls back to the default for a non-https override', () => {
    vi.stubEnv('KTIP_CATALOG_BASE_URL', 'http://mypd.oecscampus.org')
    expect(catalogBaseUrl()).toBe(DEFAULT_BASE)
  })
})

describe('loadKtipCatalog', () => {
  it('fetches a single page when the result is smaller than the page size', async () => {
    const fetchMock = vi.fn(async (..._args: FetchArgs) => ({
      ok: true,
      json: async () => ({ items: [{ course_id: '1', title: 'Intro' }], total: 1 }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { items, total } = await loadKtipCatalog()
    expect(items).toEqual([{ course_id: '1', title: 'Intro' }])
    expect(total).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_BASE}/api/external/ktip/catalog?limit=200&offset=0`)
  })

  it('pages through results until a short page is returned', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ course_id: String(i), title: `Course ${i}` }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: fullPage, total: 201 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ course_id: '200', title: 'Last' }], total: 201 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { items, total } = await loadKtipCatalog()
    expect(items).toHaveLength(201)
    expect(total).toBe(201)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('is uncached — a second call refetches, so an admin removing a course is reflected immediately', async () => {
    const fetchMock = vi
      .fn<(...args: FetchArgs) => Promise<unknown>>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ course_id: '1', title: 'Intro' }], total: 1 }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [], total: 0 }) })
    vi.stubGlobal('fetch', fetchMock)

    const first = await loadKtipCatalog()
    expect(first.items).toHaveLength(1)

    const second = await loadKtipCatalog()
    expect(second.items).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws KtipCatalogUnavailableError when the upstream fails, rather than returning []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }))
    )

    await expect(loadKtipCatalog()).rejects.toBeInstanceOf(KtipCatalogUnavailableError)
  })
})

describe('enrollInKtipCourse', () => {
  it('throws a 503 KtipEnrollError when MYPD_KTIP_API_KEY is unset', async () => {
    vi.stubEnv('MYPD_KTIP_API_KEY', '')

    await expect(enrollInKtipCourse({ email: 'a@b.com', course_id: '1' })).rejects.toMatchObject({
      status: 503,
    })
  })

  it('posts with the bearer token and returns the parsed result on success', async () => {
    vi.stubEnv('MYPD_KTIP_API_KEY', 'secret-key')
    const fetchMock = vi.fn(async (..._args: FetchArgs) => ({
      ok: true,
      json: async () => ({
        consumer: 'ktip',
        message: 'Enrolled successfully',
        user_id: 'u1',
        course_id: 'c1',
        enrollment_id: 'e1',
        is_new_user: false,
        sign_in_url: `${DEFAULT_BASE}/auth/signin`,
        course_url: `${DEFAULT_BASE}/course/c1`,
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await enrollInKtipCourse({ email: 'a@b.com', course_id: 'c1' })
    expect(result.enrollment_id).toBe('e1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${DEFAULT_BASE}/api/external/ktip/enrollments`)
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret-key')
    expect(JSON.parse(init?.body as string)).toEqual({ email: 'a@b.com', course_id: 'c1' })
  })

  it('rewrites localhost course URLs from the campus to the configured base', async () => {
    vi.stubEnv('MYPD_KTIP_API_KEY', 'secret-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          consumer: 'ktip',
          message: 'Enrolled successfully',
          user_id: 'u1',
          course_id: 'c1',
          enrollment_id: 'e1',
          is_new_user: false,
          sign_in_url: 'http://localhost:3000/auth/signin',
          course_url: 'http://localhost:3000/course/c1',
        }),
      }))
    )

    const result = await enrollInKtipCourse({ email: 'a@b.com', course_id: 'c1' })
    expect(result.course_url).toBe(`${DEFAULT_BASE}/course/c1`)
    expect(result.sign_in_url).toBe(`${DEFAULT_BASE}/auth/signin`)
  })

  it('normalizeKtipEnrollResult uses KTIP_CATALOG_BASE_URL when set', () => {
    vi.stubEnv('KTIP_CATALOG_BASE_URL', 'https://commons.oecscampus.org')
    const normalized = normalizeKtipEnrollResult({
      consumer: 'ktip',
      message: 'ok',
      user_id: 'u1',
      course_id: 'abc',
      enrollment_id: 'e1',
      is_new_user: false,
      sign_in_url: 'http://localhost:3000/auth/signin',
      course_url: 'http://localhost:3000/course/abc',
    })
    expect(normalized.course_url).toBe('https://commons.oecscampus.org/course/abc')
  })

  it.each([401, 403, 404])('maps a %d upstream response to a KtipEnrollError with that status', async (status) => {
    vi.stubEnv('MYPD_KTIP_API_KEY', 'secret-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status, json: async () => ({ error: 'upstream said no' }) }))
    )

    await expect(enrollInKtipCourse({ email: 'a@b.com', course_id: 'c1' })).rejects.toMatchObject({
      status,
      message: 'upstream said no',
    })
  })
})
