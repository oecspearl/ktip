/**
 * The naming contract between the build-time image generator and the runtime
 * that consumes its output.
 *
 * This module is imported by BOTH `scripts/optimize-images.mjs` (via Node's
 * type stripping) and the app. That is deliberate and load-bearing: a variant
 * URL the generator writes and a variant URL the browser requests have to agree
 * exactly, and a mismatch is a 404 at runtime with nothing failing at build
 * time. One function, two callers, no chance to drift.
 *
 * Keep it pure — no DOM, no sharp, no node builtins — or one of those two
 * callers stops being able to import it.
 */

export type LadderName = 'hero' | 'pages' | 'grants'

/**
 * Widths generated per source, in `w`-descriptor terms.
 *
 * Sized against what the app actually renders, not round numbers: a 390px phone
 * at DPR 3 needs 1170 and picks 1280; at DPR 2 it picks 960; a 1440 laptop at
 * DPR 2 wants 2880 and clamps to the top rung. A bento tile is ~320 CSS px, so
 * it lands on 640.
 *
 * Gaps are ~1.5x, the usual spacing for srcset candidates. The hero ladder
 * deliberately omits 1600 — it costs a third of the encode time for a step only
 * a 768px tablet at DPR 2 would pick, on desktop-class bandwidth.
 */
export const LADDERS: Record<LadderName, readonly number[]> = {
  hero: [640, 960, 1280, 1920],
  pages: [640, 960, 1600],
  grants: [640, 960, 1600],
}

/** Public URL prefix for every generated variant. Gitignored, built into dist. */
export const IMG_BASE = '/_img'

export interface ImageEntry {
  /** Intrinsic width of the source, for the `width` attribute. */
  w: number
  /** Intrinsic height of the source, for the `height` attribute (CLS). */
  h: number
  /** Content hash of the source bytes — the cache-busting part of the URL. */
  hash: string
  /** Generated widths, ascending. */
  widths: number[]
}

export interface ImageManifest {
  v: number
  base: string
  images: Record<string, ImageEntry>
}

/**
 * What every consumer sees when the generator did not run, or bailed. Lookups
 * miss, and the app falls back to the plain single-size <img> it renders today.
 */
export const EMPTY_MANIFEST: ImageManifest = { v: 1, base: IMG_BASE, images: {} }

/**
 * The ladder rungs that make sense for a source of this width.
 *
 * Never upscales — mirrors sharp's `withoutEnlargement`, so a rung above the
 * source is dropped rather than generated as a blurrier copy of it.
 *
 * The source's own width is appended when it falls between rungs. Without that,
 * `ktiphero.webp` (1748 wide) would top out at 1280 and lose its full-resolution
 * candidate entirely — a full-bleed backdrop would be upscaled on any desktop.
 */
export function capLadder(sourceWidth: number, ladder: readonly number[]): number[] {
  if (!(sourceWidth > 0)) return []
  const rungs = ladder.filter((w) => w <= sourceWidth)
  if (rungs.length === 0) return [sourceWidth]
  if (!rungs.includes(sourceWidth)) rungs.push(sourceWidth)
  return rungs
}

/**
 * `/_img/hero/hero-1-1280.4f3a9c21.avif`
 *
 * The hash sits before the extension rather than in a query string so the file
 * is content-addressed: vercel.json can serve `/_img/*` as immutable, and a
 * changed source produces a different URL instead of a stale cache hit.
 */
export function variantPath(
  dir: string,
  name: string,
  width: number,
  hash: string,
  ext: string
): string {
  return `${IMG_BASE}/${dir}/${name}-${width}.${hash}.${ext}`
}

/**
 * Splits a manifest key (`/hero/hero-1.webp`) into the directory and basename
 * used to build its variant paths. Root-level sources (`/ktiphero.webp`) are
 * filed under `root` so every variant lives one level deep.
 */
export function srcKeyParts(key: string): { dir: string; name: string } {
  const withoutLeadingSlash = key.replace(/^\//, '')
  const lastSlash = withoutLeadingSlash.lastIndexOf('/')
  const dir = lastSlash === -1 ? 'root' : withoutLeadingSlash.slice(0, lastSlash)
  const file = withoutLeadingSlash.slice(lastSlash + 1)
  return { dir, name: file.replace(/\.[^.]+$/, '') }
}

/**
 * Fingerprints the encoder settings so a quality or effort change invalidates
 * every cached output. Without it, editing a quality value would silently leave
 * the old files in place — the source bytes did not change, so nothing else
 * would notice.
 *
 * FNV-1a rather than node:crypto: this module has to stay importable from the
 * browser bundle as well as the build script.
 */
export function settingsHash(settings: unknown): string {
  const text = JSON.stringify(settings) ?? ''
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
