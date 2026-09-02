import { useState, type CSSProperties } from 'react'
import { resolveBadgeIcon } from '../../lib/badge-icons'
import { RARITY_GLARE_TINT, RARITY_GLOW, TIER_ACCENT, rarityOf } from '../../lib/achievement-style'
import { bundledTrophyArt } from '../../lib/trophy-art'
import { IMAGE_MANIFEST, lookupManifest } from '../../lib/image-manifest'
import { variantPath, srcKeyParts } from '../../lib/image-variants'
import { cn } from '../../lib/utils'
import type { BadgeRarity, BadgeTier, TrophyAssetMap } from '../../types'

/**
 * Resolution order, most specific first:
 *   1. the badge's own image_url  — one-off artwork for a legendary
 *   2. trophy_assets[type][tier]  — admin-uploaded, overrides the default
 *   3. public/trophies/<type>-<tier>.webp — the artwork bundled with the app
 *   4. a lucide icon              — always available, so nothing renders blank
 *
 * Step 3 sits below the database so an admin upload still wins, and above the
 * icon so a fresh install looks finished rather than empty.
 *
 * The icon fallback is not a degraded state: the system ships before the
 * artwork does, and a badge added later works immediately with no art at all.
 */

export interface TrophyImageProps {
  icon: string
  trophyType?: string | null
  tier?: BadgeTier | null
  imageUrl?: string | null
  rarity?: BadgeRarity | null
  assetMap: TrophyAssetMap
  name: string
  size?: number
  /** Unearned: muted so the ladder is visible without looking earned. */
  locked?: boolean
  /**
   * Sweeps a specular highlight across the metal. Opt-in rather than always
   * on: a gallery of tiles all glinting at once is a light show, so the grid
   * leaves it off and the showcase turns it on. Still opt-in after 126 cut
   * the catalog to 33 — 33 is fewer than 68 and no less of a light show.
   */
  glare?: boolean
  className?: string
}

export function resolveTrophy(
  assetMap: TrophyAssetMap,
  trophyType?: string | null,
  tier?: BadgeTier | null,
  imageUrl?: string | null
): { url: string | null; alt: string } {
  if (imageUrl) return { url: imageUrl, alt: '' }

  // Untiered badges still get artwork: 'gold' is the neutral middle of the
  // ladder and reads as a plain trophy rather than a rank.
  const asset = assetMap[trophyType || 'star']?.[tier || 'gold']
  if (asset?.image_url) return { url: asset.image_url, alt: asset.alt_text || '' }

  // No alt text with the bundled art: the caller's badge name is a better
  // description than anything generic this layer could invent, and TrophyImage
  // already falls back to it.
  return { url: bundledTrophyArt(trophyType, tier), alt: '' }
}

/**
 * Responsive candidates for a bundled trophy, or null for anything else.
 *
 * Only paths the build actually processed are eligible. A Supabase Storage URL
 * or a dev run before the first `optimize-images` pass misses the manifest and
 * renders the plain 512px source, which is correct in both cases.
 */
function trophySrcSets(url: string): { avif: string; webp: string } | null {
  const entry = lookupManifest(IMAGE_MANIFEST.images, url)
  if (!entry) return null
  const { dir, name } = srcKeyParts(url)
  const build = (ext: 'avif' | 'webp') =>
    entry.widths.map((w) => `${variantPath(dir, name, w, entry.hash, ext)} ${w}w`).join(', ')
  return { avif: build('avif'), webp: build('webp') }
}

export function TrophyImage({
  icon,
  trophyType,
  tier,
  imageUrl,
  rarity,
  assetMap,
  name,
  size = 64,
  locked,
  glare,
  className,
}: TrophyImageProps) {
  const [failed, setFailed] = useState(false)
  const { url, alt } = resolveTrophy(assetMap, trophyType, tier, imageUrl)
  const effectiveRarity = rarityOf(rarity)

  const wrapper = cn(
    'inline-flex items-center justify-center rounded-2xl',
    !locked && RARITY_GLOW[effectiveRarity],
    // Grayscale rather than hidden: seeing the trophy you have not won yet is
    // the incentive. Opacity alone still reads as "earned but faded".
    locked && 'opacity-40 grayscale',
    className
  )

  if (url && !failed) {
    const sets = trophySrcSets(url)
    const img = (
      <img
        src={url}
        // Falls back to the badge name when an admin left alt_text empty —
        // never an empty alt, a trophy is content and not decoration.
        alt={alt || name}
        {...(sets ? { srcSet: sets.webp, sizes: `${size}px` } : null)}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        // A dead Storage URL must not leave a hole in the gallery.
        onError={() => setFailed(true)}
        className="w-full h-full object-contain"
      />
    )

    const showGlare = glare && !locked

    return (
      <span className={cn(wrapper, 'relative')} style={{ width: size, height: size }}>
        {sets ? (
          <picture className="w-full h-full">
            <source type="image/avif" srcSet={sets.avif} sizes={`${size}px`} />
            {img}
          </picture>
        ) : (
          img
        )}

        {/* Specular sweep, clipped to the trophy's own alpha so it lands on the
            metal and not on the transparent background. Never on a locked
            trophy — a greyed-out silhouette that glints reads as earned.
            See .trophy-glare in index.css. */}
        {showGlare && (
          <span
            aria-hidden="true"
            className="trophy-glare pointer-events-none absolute inset-0"
            style={
              {
                maskImage: `url(${url})`,
                WebkitMaskImage: `url(${url})`,
                '--glare-tint': RARITY_GLARE_TINT[effectiveRarity],
              } as CSSProperties
            }
          />
        )}
      </span>
    )
  }

  const Icon = resolveBadgeIcon(icon)

  // Sits on the trophy card, so the box is a translucent ink wash that flips
  // with the card ground rather than the ktip-sand-50 it used to be — a fixed
  // cream tile on the card reads as a broken image, the opposite of the point.
  return (
    <span
      className={cn(wrapper, 'border border-trophy-ink/10 bg-trophy-ink/5')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
    >
      <Icon
        size={Math.round(size * 0.5)}
        className={tier ? TIER_ACCENT[tier] : 'text-trophy-ink/45'}
      />
    </span>
  )
}
