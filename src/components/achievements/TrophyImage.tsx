import { useState } from 'react'
import { resolveBadgeIcon } from '../../lib/badge-icons'
import { RARITY_GLOW, TIER_ACCENT, rarityOf } from '../../lib/achievement-style'
import { cn } from '../../lib/utils'
import type { BadgeRarity, BadgeTier, TrophyAssetMap } from '../../types'

/**
 * Resolution order, most specific first:
 *   1. the badge's own image_url  — one-off artwork for a legendary
 *   2. trophy_assets[type][tier]  — the shared 13 x 4 grid
 *   3. a lucide icon              — always available, so nothing renders blank
 *
 * The fallback is not a degraded state: the system ships before the artwork
 * does, and a badge added later works immediately with no art at all.
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
  return { url: asset?.image_url || null, alt: asset?.alt_text || '' }
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
    return (
      <span className={wrapper} style={{ width: size, height: size }}>
        <img
          src={url}
          // Falls back to the badge name when an admin left alt_text empty —
          // never an empty alt, a trophy is content and not decoration.
          alt={alt || name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          // A dead Storage URL must not leave a hole in the gallery.
          onError={() => setFailed(true)}
          className="w-full h-full object-contain"
        />
      </span>
    )
  }

  const Icon = resolveBadgeIcon(icon)

  return (
    <span
      className={cn(wrapper, 'bg-ktip-sand-50 border border-ktip-sand-200')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
    >
      <Icon size={Math.round(size * 0.5)} className={tier ? TIER_ACCENT[tier] : 'text-ktip-ocean-500'} />
    </span>
  )
}
