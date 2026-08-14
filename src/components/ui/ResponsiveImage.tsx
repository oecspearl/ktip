import type { ComponentPropsWithRef } from 'react'
import { IMAGE_MANIFEST, lookupManifest } from '../../lib/image-manifest'
import { variantPath, srcKeyParts } from '../../lib/image-variants'

/**
 * An <img> that actually uses the variants `scripts/optimize-images.mjs` builds.
 *
 * The build has been emitting a 640/960/1280/1920 AVIF+WebP ladder into
 * `/_img` on every deploy — ~22 MB of it, served immutable by vercel.json —
 * and until this component existed exactly one place consumed it
 * (TrophyImage). Every hero, page band and card requested the full-size
 * original instead: a phone rendering a 350px bento tile downloaded the 1920px
 * source. Lighthouse scored that at 1,327 kB of avoidable transfer on the
 * landing page alone, and it is the single largest contributor to a 10.5s LCP.
 *
 * Drop-in for a plain <img>: same props, same classes. When the manifest has no
 * entry for `src` — a Supabase Storage URL, a remote image, or a dev run before
 * the first optimize pass — it renders exactly the <img> it was given, which is
 * the current behaviour and always correct.
 *
 * Intrinsic width/height come from the manifest and are the CLS fix. No hero or
 * card image in the app carries dimensions today, which is most of the 0.150
 * baseline.
 */
export interface ResponsiveImageProps extends Omit<ComponentPropsWithRef<'img'>, 'srcSet'> {
  src: string
  alt: string
  /**
   * How wide the image renders, in `sizes` syntax. Omitting it means 100vw,
   * which is right for a full-bleed hero and wrong for anything in a grid — a
   * missing `sizes` on a tile makes the browser pick the largest candidate and
   * undoes the point of the ladder.
   */
  sizes?: string
  /**
   * Class for the <picture> wrapper. Defaults to `contents`, so the wrapper
   * generates no box at all and an absolutely-positioned or grid-item <img>
   * lays out exactly as it did before being wrapped.
   */
  pictureClassName?: string
  /**
   * Drops every ladder rung above this width.
   *
   * For images the design then destroys: PageHero's frosted copy is the same
   * photo under `blur(24px)`, where a 640px rung and a 1920px rung are
   * indistinguishable and the 1920 costs ~250 kB. Not a substitute for `sizes`
   * — that describes the layout box, this describes how much detail survives
   * whatever is done to the pixels.
   */
  maxWidth?: number
}

export function ResponsiveImage({
  src,
  alt,
  sizes,
  pictureClassName = 'contents',
  maxWidth,
  width,
  height,
  ...img
}: ResponsiveImageProps) {
  const entry = lookupManifest(IMAGE_MANIFEST.images, src)

  if (!entry) {
    return <img src={src} alt={alt} width={width} height={height} {...img} />
  }

  const { dir, name } = srcKeyParts(src)
  // Never empty: if the cap sits below the smallest rung, keep that rung rather
  // than emitting a srcset with no candidates.
  const capped = maxWidth ? entry.widths.filter((w) => w <= maxWidth) : entry.widths
  const widths = capped.length > 0 ? capped : entry.widths.slice(0, 1)
  const srcSetFor = (ext: 'avif' | 'webp') =>
    widths.map((w) => `${variantPath(dir, name, w, entry.hash, ext)} ${w}w`).join(', ')

  return (
    <picture className={pictureClassName}>
      {/* AVIF first — the browser takes the first <source> it can decode, and
          the AVIF rungs run roughly 30% under their WebP equivalents. */}
      <source type="image/avif" srcSet={srcSetFor('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSetFor('webp')} sizes={sizes} />
      <img
        // `src` stays the original, not a rung: it is what a browser without
        // srcset support and every crawler and share-preview fetches.
        src={src}
        alt={alt}
        srcSet={srcSetFor('webp')}
        sizes={sizes}
        width={width ?? entry.w}
        height={height ?? entry.h}
        {...img}
      />
    </picture>
  )
}
