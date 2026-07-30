/**
 * OECS Virtual Campus KTIP catalog — see ktip-catalog-api.md.
 *
 * A different API from vc-catalog.ts's `/api/external/catalog`: this is the
 * KTIP-specific `/api/external/ktip/catalog` + `/api/external/ktip/enrollments`
 * pair, gated behind a separate secret (`MYPD_KTIP_API_KEY`, not
 * `COMMONS_API_KEY`) and served identically from every platform host (mypd,
 * commons, default apex) — one base URL is enough, no multi-host merge.
 */

export interface KtipCourse {
  catalog_type: 'external' | 'native'
  course_id: string
  candidate_id?: string | null
  title: string
  short_description?: string | null
  thumbnail_url?: string | null
  difficulty?: string | null
  subject_area?: string | null
  grade_level?: string | null
  language?: string | null
  is_external?: boolean
  external_launch_url?: string | null
  provider_key?: string | null
  provider_name?: string | null
  canonical_url?: string | null
  hosted_on_mypd?: boolean
  enrollable?: boolean
  published?: boolean
}

export interface KtipEnrollResult {
  consumer: string
  message: string
  user_id: string
  course_id: string
  enrollment_id: string
  is_new_user: boolean
  sign_in_url: string
  course_url: string
}

const DEFAULT_BASE_URL = 'https://commons.oecscampus.org'

/**
 * Validated base URL — a malformed override (stray comma, truncated host)
 * would otherwise silently replace a working default with a URL that can
 * never resolve, breaking every course-catalog request until noticed.
 */
export function catalogBaseUrl(): string {
  const configured = (process.env.KTIP_CATALOG_BASE_URL || '').trim().replace(/\/+$/, '')
  if (!configured) return DEFAULT_BASE_URL
  try {
    const { protocol, hostname } = new URL(configured)
    const validHost = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hostname)
    if (protocol === 'https:' && validHost) return configured
  } catch {
    // fall through to default
  }
  console.warn(`[ktip-catalog] KTIP_CATALOG_BASE_URL "${configured}" is invalid — using default`)
  return DEFAULT_BASE_URL
}

/** Thrown when the upstream catalog can't be reached — no second host to fall back to. */
export class KtipCatalogUnavailableError extends Error {}

/** Thrown for enrollment failures, carrying the upstream status so the caller can map it. */
export class KtipEnrollError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const PAGE_SIZE = 200 // the endpoint's documented maximum
const MAX_PAGES = 10 // backstop; 2000 courses is far beyond the real catalogue

async function fetchCatalogPage(offset: number): Promise<{ items: KtipCourse[]; total: number }> {
  const url = `${catalogBaseUrl()}/api/external/ktip/catalog?limit=${PAGE_SIZE}&offset=${offset}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`ktip catalog ${res.status}`)
  const body = (await res.json()) as { items?: KtipCourse[]; total?: number }
  return { items: Array.isArray(body.items) ? body.items : [], total: body.total ?? 0 }
}

/**
 * The full KTIP-visible catalog, fetched fresh from the Virtual Campus on
 * every call — deliberately uncached. A course an admin just unpublished
 * (or just flagged available_to_ktip) must reflect immediately; a courses
 * page isn't hit often enough for the extra request to matter the way a
 * fan-out CV sync's request volume would.
 *
 * Unlike vc-catalog.ts's loadCatalog(), a failure here is NOT swallowed into
 * an empty result: with only one configured base URL there is no second host
 * to quietly cover for a dead one, and a silent [] would look identical to
 * "no course has been flagged available_to_ktip yet" — misleading whoever's
 * debugging it. Callers should catch KtipCatalogUnavailableError explicitly.
 */
export async function loadKtipCatalog(): Promise<{ items: KtipCourse[]; total: number }> {
  try {
    const items: KtipCourse[] = []
    let total = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await fetchCatalogPage(page * PAGE_SIZE)
      total = result.total
      items.push(...result.items)
      if (result.items.length < PAGE_SIZE) break
    }
    return { items, total }
  } catch (err) {
    throw new KtipCatalogUnavailableError((err as Error).message)
  }
}

/**
 * Enrolls a learner (by email, resolved server-side by the caller) into a
 * KTIP-visible course. Throws KtipEnrollError with the upstream status so the
 * edge handler can map 401/403/404 to a caller-appropriate response.
 */
/** Server-side bearer for POST/GET .../api/external/ktip/enrollments. */
export function ktipApiKey(): string | null {
  const key = (process.env.MYPD_KTIP_API_KEY || '').trim()
  return key || null
}

export function ktipCourseUrl(courseId: string): string {
  return `${catalogBaseUrl()}/course/${courseId}`
}

/** VC may return localhost URLs when NEXT_PUBLIC_APP_URL is unset — always use our configured base. */
export function normalizeKtipEnrollResult(result: KtipEnrollResult): KtipEnrollResult {
  const base = catalogBaseUrl()
  return {
    ...result,
    sign_in_url: `${base}/auth/signin`,
    course_url: ktipCourseUrl(result.course_id),
  }
}

export interface KtipEnrollment {
  enrollment_id: string
  course_id: string
  course_url: string
  enrolled_at: string | null
  progress_percentage: number | null
}

/** Active KTIP enrollments for the signed-in learner's email. */
export async function loadKtipEnrollments(email: string): Promise<KtipEnrollment[]> {
  const apiKey = ktipApiKey()
  if (!apiKey) throw new KtipEnrollError(503, 'Server configuration error')

  const url = `${catalogBaseUrl()}/api/external/ktip/enrollments?email=${encodeURIComponent(email)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  })

  if (res.status === 404) return []
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    const message = body.error || body.message || `Enrollment lookup failed (${res.status})`
    throw new KtipEnrollError(res.status, message)
  }

  const body = (await res.json()) as {
    enrollments?: Array<{
      id: string
      course_id: string
      enrolled_at?: string | null
      progress_percentage?: number | null
    }>
  }

  const list = Array.isArray(body.enrollments) ? body.enrollments : []
  return list.map((row) => ({
    enrollment_id: row.id,
    course_id: row.course_id,
    course_url: ktipCourseUrl(row.course_id),
    enrolled_at: row.enrolled_at ?? null,
    progress_percentage: row.progress_percentage ?? null,
  }))
}

export async function enrollInKtipCourse(input: {
  email: string
  course_id: string
  name?: string | null
}): Promise<KtipEnrollResult> {
  const apiKey = ktipApiKey()
  if (!apiKey) throw new KtipEnrollError(503, 'Server configuration error')

  const res = await fetch(`${catalogBaseUrl()}/api/external/ktip/enrollments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      course_id: input.course_id,
      ...(input.name ? { name: input.name } : {}),
    }),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    const message = body.error || body.message || `Enrollment failed (${res.status})`
    throw new KtipEnrollError(res.status, message)
  }

  return normalizeKtipEnrollResult((await res.json()) as KtipEnrollResult)
}
