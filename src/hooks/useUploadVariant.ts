import { useState } from 'react'
import { variantUrl } from '../lib/upload-variants'

export interface UploadVariantOptions {
  /** Which sibling to ask for — AVATAR_VARIANT_WIDTH or COVER_VARIANT_WIDTH. */
  width: number
  /**
   * The original's width, for a srcset that offers both and lets the browser
   * choose by layout and DPR — right for a full-bleed hero.
   *
   * Omitted, the sibling REPLACES the original outright. That is for surfaces
   * whose detail is thrown away anyway: a small avatar, or a card banner under
   * a dark wash, where a srcset would still pick the full original on any
   * DPR-3 phone because the box times three outruns the sibling.
   */
  originalWidth?: number
}

export interface UploadVariantImage {
  src: string | undefined
  srcSet: string | undefined
  /**
   * Set while the sibling is in play. It retires the sibling and nothing else,
   * so an <img> that fails again on the original reaches the caller's own
   * handler instead of being swapped forever.
   */
  onError: (() => void) | undefined
}

/**
 * An uploaded image's smaller sibling, with a single fallback to the original.
 *
 * Uploads from before siblings existed have none until the backfill runs, so a
 * 404 here is an ordinary event, not an error: the first one swaps this image
 * back to the original URL and the sibling is not tried again for it.
 *
 * The retired URL is remembered rather than a flag, so a new `original` (the
 * member uploads another photo) gets its own sibling tried afresh.
 *
 * `options` null or the URL not ours (see variantUrl) returns the original
 * untouched — callers can run this unconditionally.
 */
export function useUploadVariant(
  original: string | null | undefined,
  options: UploadVariantOptions | null | undefined
): UploadVariantImage {
  const variant = options ? variantUrl(original, options.width) : null
  const [retired, setRetired] = useState<string | null>(null)

  if (!original || !options || variant === null || retired === variant) {
    return { src: original ?? undefined, srcSet: undefined, onError: undefined }
  }

  const onError = () => setRetired(variant)

  if (options.originalWidth) {
    return {
      src: original,
      srcSet: `${variant} ${options.width}w, ${original} ${options.originalWidth}w`,
      onError,
    }
  }
  return { src: variant, srcSet: undefined, onError }
}
