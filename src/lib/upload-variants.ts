/**
 * Upload-time image variants: the naming contract between the uploader
 * (storage-upload.ts), the one-off backfill (scripts/backfill-image-variants.mjs)
 * and the components that ask for a smaller copy.
 *
 * Every avatar used to be served at its full 512px to a 32px circle, and every
 * profile banner at 1920px to a ~350px directory card. Supabase's on-the-fly
 * transforms would fix that per request, but they are a paid add-on and a
 * second origin for the image cache; instead the uploader writes one small
 * sibling next to the original, at a name anyone can derive from the original's
 * URL. A sibling that does not exist yet (an upload from before this, or a
 * browser that cannot encode WebP) is a 404, and every consumer falls back to
 * the original once — see useUploadVariant.
 *
 * Imported by the backfill script through Node's type stripping, so it must stay
 * pure: no DOM, no Supabase client, no imports at all.
 */

/**
 * The avatar sibling. An avatar footprint of 48 CSS px paints ~49 px of photo
 * (the diamond's inner layer is overscanned), which is ~148 device px at DPR 3;
 * 128 is close enough that a face does not visibly soften, and it covers every
 * list, row and card avatar in the app.
 */
export const AVATAR_VARIANT_WIDTH = 128

/**
 * The banner and cover sibling: a directory card under its dark wash, or a
 * cover on a small screen. Full-bleed heroes still offer the original beside
 * it in a srcset and let the browser choose.
 */
export const COVER_VARIANT_WIDTH = 640

/** Every width a sibling is written at, so a sibling is never given its own. */
export const VARIANT_WIDTHS: readonly number[] = [AVATAR_VARIANT_WIDTH, COVER_VARIANT_WIDTH]

/**
 * Sources a sibling can be made from: the formats the uploader re-encodes.
 * A GIF or an SVG is uploaded untouched (canvas would flatten the animation or
 * rasterise the vector), so it never gets a sibling and is never asked for one.
 */
const SOURCE_EXTENSION = /\.(webp|jpe?g|png)$/i

/** Supabase Storage's public object route — the only URLs that have siblings. */
const PUBLIC_OBJECT_ROUTE = '/storage/v1/object/public/'

/** `<uid>/avatar` + 128 → `<uid>/avatar-128.webp`. Always WebP, whatever the original. */
export function variantKey(basePath: string, width: number): string {
  return `${basePath}-${width}.webp`
}

/** True for an object that is itself a sibling (`…-128.webp`, `…-640.webp`). */
export function isVariantKey(key: string): boolean {
  const match = /-(\d+)\.webp$/i.exec(key)
  return match !== null && VARIANT_WIDTHS.includes(Number(match[1]))
}

/**
 * The sibling's object key for an original's key, or null when it cannot have
 * one: `<uid>/banner.jpg` + 640 → `<uid>/banner-640.webp`.
 */
export function variantKeyFor(objectKey: string, width: number): string | null {
  if (!SOURCE_EXTENSION.test(objectKey) || isVariantKey(objectKey)) return null
  return variantKey(objectKey.replace(SOURCE_EXTENSION, ''), width)
}

/**
 * The sibling's public URL for an uploaded image's public URL, or null when the
 * URL is not one of ours to resize.
 *
 * Null covers a relative path (a bundled photo, which the build-time ladder in
 * image-variants.ts handles), any other host (an OAuth avatar, a seeded stock
 * photo), and a GIF or SVG. The query string is kept: the uploader's
 * cache-bust `?v=` is written for the original and its sibling together, so it
 * busts both.
 */
export function variantUrl(url: string | null | undefined, width: number): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const at = parsed.pathname.indexOf(PUBLIC_OBJECT_ROUTE)
  if (at === -1) return null
  const prefix = parsed.pathname.slice(0, at + PUBLIC_OBJECT_ROUTE.length)
  const sibling = variantKeyFor(parsed.pathname.slice(prefix.length), width)
  if (!sibling) return null
  parsed.pathname = prefix + sibling
  return parsed.toString()
}
