/**
 * Profile banners (migration 104).
 *
 * A banner is one JSONB spec on the profile row, one of three kinds. It shows
 * on four surfaces — the member page hero, the directory card, the member
 * drawer cover and the owner's dashboard hero — and each surface can hold its
 * own drag-set focal point (`pos`), because a crop that centres well on a wide
 * hero band rarely centres well on a squarer card.
 *
 * The gradient kind is the "aurora" formula: a near-black base, two-to-four
 * flat colour shapes diffused into glow (heavy blur on the animated render,
 * radial falloff on the static one), blended additively, under a film-grain
 * veil. Placement is DETERMINISTIC from `seed` — the studio's Shuffle button
 * re-rolls the seed, nothing else — so the same spec renders the same banner
 * on every surface and every visit.
 */

export type BannerSurface = 'card' | 'panel' | 'page' | 'dashboard'

/** Per-surface object-position, in percent. Absent = centred. */
export type SurfacePos = Partial<Record<BannerSurface, { x: number; y: number }>>

export type BannerSpec =
  | { kind: 'image'; url: string; pos?: SurfacePos }
  | { kind: 'preset'; id: string; pos?: SurfacePos }
  | { kind: 'gradient'; colors: string[]; seed?: number }

export interface PresetBanner {
  id: string
  url: string
  /** Alt/label text; deliberately untranslated — these are artwork names. */
  name: string
}

/** Built-in designs — same aurora aesthetic, baked into tiny SVGs. */
export const PRESET_BANNERS: PresetBanner[] = [
  { id: 'banner-01', url: '/banners/banner-01.svg', name: 'Deep Water' },
  { id: 'banner-02', url: '/banners/banner-02.svg', name: 'Lagoon' },
  { id: 'banner-03', url: '/banners/banner-03.svg', name: 'Palm Light' },
  { id: 'banner-04', url: '/banners/banner-04.svg', name: 'Sunrise' },
  { id: 'banner-05', url: '/banners/banner-05.svg', name: 'Hibiscus' },
  { id: 'banner-06', url: '/banners/banner-06.svg', name: 'Ultraviolet' },
  { id: 'banner-07', url: '/banners/banner-07.svg', name: 'Reef' },
  { id: 'banner-08', url: '/banners/banner-08.svg', name: 'Midnight' },
  { id: 'banner-09', url: '/banners/banner-09.svg', name: 'Trade Winds' },
  { id: 'banner-10', url: '/banners/banner-10.svg', name: 'Ember' },
]

const PRESET_BY_ID = new Map(PRESET_BANNERS.map((p) => [p.id, p]))

/** Starting palette for the gradient builder (the classic aurora blue-violet). */
export const DEFAULT_GRADIENT_COLORS = ['#4318E0', '#8FB4DC', '#FFFFFF']

// --------------------------------------------------------------------------
// Spec plumbing
// --------------------------------------------------------------------------

/**
 * Parse whatever the profiles.banner column holds. The column is client-owned
 * JSONB, so a malformed value (older client, manual edit) must degrade to
 * "no banner", never to a crash.
 */
export function parseBanner(value: unknown): BannerSpec | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.kind === 'image' && typeof v.url === 'string' && v.url) return v as unknown as BannerSpec
  if (v.kind === 'preset' && typeof v.id === 'string' && PRESET_BY_ID.has(v.id))
    return v as unknown as BannerSpec
  if (
    v.kind === 'gradient' &&
    Array.isArray(v.colors) &&
    v.colors.length >= 2 &&
    v.colors.every((c) => typeof c === 'string')
  )
    return v as unknown as BannerSpec
  return null
}

/** Image URL for the image-backed kinds; null for gradients / no banner. */
export function bannerImage(spec: BannerSpec | null): string | null {
  if (!spec) return null
  if (spec.kind === 'image') return spec.url
  if (spec.kind === 'preset') return PRESET_BY_ID.get(spec.id)?.url ?? null
  return null
}

/** CSS object-position for a surface, e.g. "50% 40%". Undefined = default. */
export function bannerPosition(
  spec: BannerSpec | null,
  surface: BannerSurface
): string | undefined {
  if (!spec || spec.kind === 'gradient') return undefined
  const p = spec.pos?.[surface]
  if (!p) return undefined
  return `${clamp(p.x, 0, 100)}% ${clamp(p.y, 0, 100)}%`
}

export function isGradientBanner(spec: BannerSpec | null): spec is Extract<BannerSpec, { kind: 'gradient' }> {
  return spec?.kind === 'gradient'
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// --------------------------------------------------------------------------
// The aurora formula
// --------------------------------------------------------------------------

/** Same stable hash as hero-images.ts, kept local so the modules stay independent. */
const hash = (seed: string) => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

/**
 * Deterministic 0..1 from a seed + salt. The polynomial hash alone is linear —
 * salts differing in one trailing character land within 0.1% of each other,
 * which stacked every blob on one spot — so it gets an avalanche finalizer.
 */
const rnd = (seed: number, salt: string) => {
  let h = hash(`${salt}:${seed}`)
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export interface AuroraBlob {
  color: string
  /** Centre, percent of the banner box. */
  cx: number
  cy: number
  /** Radius, percent of the banner's larger dimension. */
  r: number
  /** Drift loop duration, seconds — varied per blob so motion never syncs. */
  driftDuration: number
  /** Which of the drift keyframe tracks to run (aurora-drift-a/b/c). */
  driftTrack: 0 | 1 | 2
}

export interface AuroraLayout {
  /** Near-black base, tinted from the first colour. */
  base: string
  blobs: AuroraBlob[]
}

/**
 * The placement half of the formula. Colours are laid down in order, first
 * colour reading as the dominant glow: bottom-weighted centres (light rises
 * from the lower half, like the reference art), later colours pulled toward
 * the base of the frame so the brightest colour (conventionally last, often
 * white) sits low like a sunrise core.
 */
export function auroraLayout(spec: Extract<BannerSpec, { kind: 'gradient' }>): AuroraLayout {
  const seed = spec.seed ?? 1
  const colors = spec.colors.slice(0, 4)
  const blobs: AuroraBlob[] = colors.map((color, i) => {
    const t = colors.length === 1 ? 0.5 : i / (colors.length - 1)
    return {
      color,
      // Spread across the width; jitter keeps two seeds from ever matching.
      cx: clamp(15 + rnd(seed, `x${i}`) * 70, 12, 88),
      // Bottom-weighted, like the reference art: the top third stays base-dark
      // (which is also what keeps a card's title legible), the glow rises from
      // below, and the brightest colour (conventionally last, often white)
      // sits lowest as the sunrise core.
      cy: clamp(38 + t * 38 + (rnd(seed, `y${i}`) - 0.5) * 18, 28, 84),
      // First colour is the broad field, later colours are tighter cores —
      // equal-sized layers screen-blended together just add up to white.
      r: 24 + rnd(seed, `r${i}`) * 14 + (1 - t) * 16,
      driftDuration: 22 + Math.round(rnd(seed, `d${i}`) * 16),
      driftTrack: (i % 3) as 0 | 1 | 2,
    }
  })
  return { base: tintedBase(colors[0]), blobs }
}

/** Near-black with a whisper of the dominant colour — the dark canvas. */
function tintedBase(color: string): string {
  const [r, g, b] = hexRgb(color)
  const mix = (c: number) => Math.round(c * 0.14 + 6)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [64, 64, 96]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Static render of the same layout, as a plain CSS background — used where
 * dozens of banners are on screen at once (directory cards): a stack of
 * radial-gradients whose falloff IS the diffusion, so there is no `filter`
 * cost and nothing animates. Layers screen-blend into the base, the closest
 * background-blend approximation of the animated render's plus-lighter.
 */
export function auroraCss(spec: Extract<BannerSpec, { kind: 'gradient' }>): {
  backgroundColor: string
  backgroundImage: string
  backgroundBlendMode: string
} {
  const { base, blobs } = auroraLayout(spec)
  // A small solid core, then a long falloff — the ramp is the diffusion. The
  // falloff is kept short enough that the base's darkness survives between
  // blobs; wall-to-wall layers screen-blend into a white-out.
  const layers = blobs.map(
    (b) =>
      `radial-gradient(circle at ${b.cx.toFixed(1)}% ${b.cy.toFixed(1)}%, ${b.color} 0%, ${b.color} ${Math.round(b.r * 0.12)}%, transparent ${Math.round(b.r * 1.4)}%)`
  )
  return {
    backgroundColor: base,
    backgroundImage: layers.join(', '),
    backgroundBlendMode: [...blobs.map(() => 'screen'), 'normal'].join(', '),
  }
}

/**
 * Neutral dark scrim for text legibility over a member's chosen banner art.
 * Deliberately colourless: the seeded navy brand wash reads as "stays blue"
 * over a banner that is red, green or violet — black complements anything.
 */
export const BANNER_WASH = 'from-black/60 via-black/25 to-transparent'

/**
 * Film grain, shared by both renders — the veil that stops the glow banding.
 * An inline SVG so it costs no request and scales with the device, not the box.
 */
export const AURORA_GRAIN_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"
