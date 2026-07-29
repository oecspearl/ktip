/**
 * OECS Virtual Campus course data.
 *
 * Two endpoints, with very different access rules:
 *
 *   GET /api/external/catalog       — public, no auth, returns the course
 *                                     catalogue with curated subject_area and
 *                                     grade_level tags.
 *   GET /api/external/enrollments   — requires `Authorization: Bearer
 *                                     <COMMONS_API_KEY>`, returns one learner's
 *                                     enrollments and progress.
 *
 * The second is why this file exists server-side only: the key is a
 * platform-wide credential that can read any learner's history by email, so it
 * must never reach the browser.
 *
 * Both endpoints are served from `oecscampus.org` AND `commons.oecscampus.org`
 * with *different* catalogues behind them (academic courses vs professional
 * development modules) while sharing one identity provider. A learner may hold
 * enrollments on either, so both hosts are queried and the results merged.
 */

export interface CatalogItem {
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
  /** Wire field name, kept verbatim — the campus API still calls it this. */
  hosted_on_mypd?: boolean
  enrollable?: boolean
  published?: boolean
}

export interface Enrollment {
  id: string
  status: string
  enrolled_at: string | null
  progress_percentage: number | null
  course_id: string
  courses?: {
    id: string
    title: string
    thumbnail?: string | null
    is_external?: boolean
    external_launch_url?: string | null
    published?: boolean
  } | null
  /** Set by mergeEnrollments so downstream knows which host answered. */
  source_base?: string
}

const DEFAULT_BASES = ['https://commons.oecscampus.org', 'https://oecscampus.org']

/**
 * Configured hosts, falling back to the known ones.
 *
 * Entries are validated rather than trusted: a malformed value (a stray comma,
 * a host that lost a label to an over-eager secret scrubber) would otherwise
 * silently replace a working default with a URL that can never resolve, and the
 * only symptom would be a CV with no courses on it.
 */
export function catalogBases(): string[] {
  const configured = (process.env.COMMONS_BASE_URLS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => {
      if (!s) return false
      try {
        const { protocol, hostname } = new URL(s)
        // Rejects "https://.oecscampus.org" and friends — a leading/trailing
        // dot or an empty label is a typo, not a host.
        return protocol === 'https:' && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hostname)
      } catch {
        return false
      }
    })

  if (configured.length === 0) return DEFAULT_BASES
  return configured
}

/**
 * Catalogue cache, module-scope so a warm isolate reuses it. The catalogue is
 * public and changes on the order of days, while a sync may look up dozens of
 * courses — refetching per course would turn one CV build into 50 requests.
 */
const CATALOG_TTL_MS = 15 * 60 * 1000
let catalogCache: { at: number; byId: Map<string, CatalogItem> } | null = null

const PAGE_SIZE = 200 // the endpoint's documented maximum
const MAX_PAGES = 10 // backstop; 2000 courses is far beyond the real catalogue

async function fetchCatalogPage(base: string, offset: number): Promise<CatalogItem[]> {
  const url = `${base}/api/external/catalog?limit=${PAGE_SIZE}&offset=${offset}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`catalog ${res.status} from ${base}`)
  const body = (await res.json()) as { items?: CatalogItem[] }
  return Array.isArray(body.items) ? body.items : []
}

/**
 * Course id -> catalogue entry, across every configured host.
 *
 * A host that fails is skipped rather than fatal: a CV built without subject
 * tags is worth far more than a sync that refuses to run because one campus is
 * down. The enrollment payload already carries the title, which is the only
 * field the CV strictly needs.
 */
export async function loadCatalog(): Promise<Map<string, CatalogItem>> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.byId
  }

  const byId = new Map<string, CatalogItem>()

  await Promise.all(
    catalogBases().map(async (base) => {
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const items = await fetchCatalogPage(base, page * PAGE_SIZE)
          for (const item of items) {
            if (item?.course_id && !byId.has(item.course_id)) byId.set(item.course_id, item)
          }
          if (items.length < PAGE_SIZE) break
        }
      } catch (err) {
        console.warn(`[vc-catalog] catalog fetch failed for ${base}: ${(err as Error).message}`)
      }
    })
  )

  catalogCache = { at: Date.now(), byId }
  return byId
}

/**
 * Every enrollment held by this email, across every configured host.
 *
 * Returns [] rather than throwing when the key is missing or every host fails.
 * The caller is either signing somebody in or running a background sync, and
 * neither should collapse because the course service is unavailable — the CV
 * simply lands without a course section, and the next sync fills it in.
 */
export async function loadEnrollments(email: string): Promise<Enrollment[]> {
  const apiKey = process.env.COMMONS_API_KEY
  if (!apiKey) {
    console.warn('[vc-catalog] COMMONS_API_KEY not set — course history unavailable')
    return []
  }

  const results = await Promise.all(
    catalogBases().map(async (base) => {
      try {
        const url = `${base}/api/external/enrollments?email=${encodeURIComponent(email)}`
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        })
        // 404 is the ordinary "this learner has no account on this host"
        // answer when a learner exists on only one of the two campuses.
        if (res.status === 404) return []
        if (!res.ok) throw new Error(`enrollments ${res.status}`)
        const body = (await res.json()) as { enrollments?: Enrollment[] }
        const list = Array.isArray(body.enrollments) ? body.enrollments : []
        return list.map((e) => ({ ...e, source_base: base }))
      } catch (err) {
        console.warn(`[vc-catalog] enrollments failed for ${base}: ${(err as Error).message}`)
        return []
      }
    })
  )

  // Same course_id can legitimately appear on both hosts; keep the furthest
  // progressed, since that is the one the learner actually did.
  const byCourse = new Map<string, Enrollment>()
  for (const enrollment of results.flat()) {
    if (!enrollment?.course_id) continue
    const existing = byCourse.get(enrollment.course_id)
    if (!existing || (enrollment.progress_percentage ?? 0) > (existing.progress_percentage ?? 0)) {
      byCourse.set(enrollment.course_id, enrollment)
    }
  }
  return Array.from(byCourse.values())
}

/** Test seam — the cache is module-scope and would otherwise leak across cases. */
export function resetCatalogCache(): void {
  catalogCache = null
}
