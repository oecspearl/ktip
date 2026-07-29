import type { BadgeRarity, BadgeTier } from '../types'

/**
 * Rarity and tier expressed in the OECS palette.
 *
 * The brand has exactly five primitives (index.css) and no "rare purple" to
 * borrow, so rarity climbs the existing scales instead: neutral sand for
 * common, through to a navy fill with a yellow rim for legendary. Tier is
 * carried mainly by the trophy artwork; these classes are what render when a
 * trophy has no image uploaded yet.
 *
 * Contrast rule from index.css: tropical and sun below shade 700 are not
 * legible as text on white. Nothing here uses them that way.
 */

export const RARITY_ORDER: BadgeRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

export const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

export const RARITY_POINTS: Record<BadgeRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  epic: 100,
  legendary: 200,
}

/** Inline pill (filter chips, badge lists). */
export const RARITY_PILL: Record<BadgeRarity, string> = {
  common: 'bg-ktip-sand-50 text-ktip-sand-700 border-ktip-sand-200',
  uncommon: 'bg-ktip-tropical-50 text-ktip-tropical-700 border-ktip-tropical-200',
  rare: 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200',
  epic: 'bg-ktip-sun-50 text-ktip-sun-700 border-ktip-sun-300',
  legendary: 'bg-ktip-ocean-700 text-ktip-sun-300 border-ktip-sun-500',
}

/** Card frame in the gallery and unlock popup. */
export const RARITY_CARD: Record<BadgeRarity, string> = {
  common: 'border-ktip-sand-200 bg-ktip-sand-50/60',
  uncommon: 'border-ktip-tropical-200 bg-ktip-tropical-50/60',
  rare: 'border-ktip-ocean-200 bg-ktip-ocean-50/60',
  epic: 'border-ktip-sun-300 bg-ktip-sun-50/70',
  legendary: 'border-ktip-sun-500 bg-ktip-ocean-700 text-ktip-cream shadow-lg',
}

/** Halo behind the trophy image. Legendary is the only one that glows. */
export const RARITY_GLOW: Record<BadgeRarity, string> = {
  common: '',
  uncommon: '',
  rare: 'ring-1 ring-ktip-ocean-200',
  epic: 'ring-2 ring-ktip-sun-300',
  legendary: 'ring-2 ring-ktip-sun-500 shadow-[0_0_24px_rgba(255,199,44,0.45)]',
}

export const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'diamond']

export const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  diamond: 'Diamond',
}

/** Tier accent for the fallback icon when no artwork exists. */
export const TIER_ACCENT: Record<BadgeTier, string> = {
  bronze: 'text-ktip-sand-600',
  silver: 'text-ktip-sand-400',
  gold: 'text-ktip-sun-600',
  diamond: 'text-ktip-ocean-400',
}

/** Human label for a check_key, used in progress bars. */
export function rarityOf(rarity?: BadgeRarity | null): BadgeRarity {
  return rarity && RARITY_ORDER.includes(rarity) ? rarity : 'common'
}
