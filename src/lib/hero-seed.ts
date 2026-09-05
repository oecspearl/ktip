import type { Grant } from '../types'

/**
 * The first hero slide, baked into index.html at build time.
 *
 * Measurement, not a hunch: the landing hero is both the LCP element and the
 * only counted layout shift on `/`, and one cause produces both. `active` at
 * DiscoverPage comes from `useGrants({ active: true })`, so until that round
 * trip lands the hero renders a short intro slide; when it lands the copy
 * column grows 289px -> 453px and, being vertically centred, its top moves UP
 * 91px. Measured on a throttled phone: LCP 5,856ms (the grant headline, the
 * largest element on the page) and CLS 0.1156 from that single swap.
 *
 * Seeding the first render with real rows removes the swap. There is nothing
 * to grow into, so the shift disappears, and the headline paints with the rest
 * of the page instead of a network round trip later.
 *
 * Deliberately NOT wired into the react-query cache. That would couple this to
 * the exact shape of `keys.list('grants', normalized)` — a key built from
 * personalization state — and a drifting key would fail silently. The hero
 * reads the seed directly and react-query keeps owning the live data.
 */
const SEED_ELEMENT_ID = '__ktip_hero_seed'

/** Only the columns DiscoverPage's `items` memo and grantHeroDetails read. */
export type HeroSeedGrant = Pick<
  Grant,
  | 'id'
  | 'slug'
  | 'title'
  | 'summary'
  | 'description'
  | 'currency'
  | 'amount_max'
  | 'amount_min'
  | 'grant_type'
  | 'funding_type'
  | 'deadline'
  | 'eligibility'
  | 'details'
  | 'is_climate_action'
>

/** `undefined` = not read yet; `null` = read, nothing there. */
let cached: HeroSeedGrant[] | null | undefined

/**
 * Rows are read once and frozen. The hero passes this straight into a useMemo
 * dependency list, so a fresh array each call would rebuild `items` on every
 * render and defeat the point.
 */
export function readHeroSeed(): HeroSeedGrant[] | null {
  if (cached !== undefined) return cached
  cached = null
  if (typeof document === 'undefined') return cached
  try {
    const el = document.getElementById(SEED_ELEMENT_ID)
    if (!el?.textContent) return cached
    const parsed = JSON.parse(el.textContent)
    // A malformed or empty seed is the same as no seed: fall through to the
    // live query rather than render a broken slide.
    if (Array.isArray(parsed) && parsed.length > 0) cached = parsed as HeroSeedGrant[]
  } catch {
    // Never let a bad seed take the page down — it is an optimisation.
  }
  return cached
}

export { SEED_ELEMENT_ID }