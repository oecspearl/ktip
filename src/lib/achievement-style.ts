import { msg } from '@lingui/core/macro'
import type { BadgeRarity, BadgeTier } from '../types'
import type { Copy } from '../i18n/copy'

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

/**
 * Descriptors, not strings: these render on the trophy card and in filter
 * chips, both of which are translated surfaces. Resolve at the call site with
 * `resolveCopy(i18n, …)`.
 */
export const RARITY_LABEL: Record<BadgeRarity, Copy> = {
  common: msg`Common`,
  uncommon: msg`Uncommon`,
  rare: msg`Rare`,
  epic: msg`Epic`,
  legendary: msg`Legendary`,
}

export const RARITY_POINTS: Record<BadgeRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  epic: 100,
  legendary: 200,
}

/**
 * Inline pill (filter chips, badge lists) — the ORDINARY-SURFACE treatment.
 *
 * These are the inverting brand ramps and belong on cream cards, directory
 * rows and the member drawer. The trophy card does not use them; it is a dark
 * surface and has its own fixed palette below.
 */
export const RARITY_PILL: Record<BadgeRarity, string> = {
  common: 'bg-ktip-sand-50 text-ktip-sand-700 border-ktip-sand-200',
  uncommon: 'bg-ktip-tropical-50 text-ktip-tropical-700 border-ktip-tropical-200',
  rare: 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200',
  epic: 'bg-ktip-sun-50 text-ktip-sun-700 border-ktip-sun-300',
  legendary:
    'bg-ktip-ocean-700 text-ktip-sun-300 border-ktip-sun-500 dark:bg-ktip-ocean-200 dark:text-ktip-sun-700',
}

/* ---------------------------------------------------------------------------
 * Trophy card palette. Everything below rides the THEME-RESPONSIVE trophy
 * tokens (rarity-*, metal-*, trophy-ink): light card ground with dark accents
 * by day, the original near-black ground with bright accents at night. None
 * of it may use a raw white/black literal — see the tokens in index.css.
 * ------------------------------------------------------------------------ */

/**
 * The card ground: a soft pastel diagonal per rarity by day, collapsing to
 * the flat near-black ground at night (the g1/g2 tokens flip in html.dark).
 * Locked cards always take the neutral common wash — the colour is the
 * reward. Product-gradient style: light start top-left, tinted end.
 */
export const RARITY_GROUND: Record<BadgeRarity, string> = {
  common: 'bg-gradient-to-br from-trophy-g1-common to-trophy-g2-common',
  uncommon: 'bg-gradient-to-br from-trophy-g1-uncommon to-trophy-g2-uncommon',
  rare: 'bg-gradient-to-br from-trophy-g1-rare to-trophy-g2-rare',
  epic: 'bg-gradient-to-br from-trophy-g1-epic to-trophy-g2-epic',
  legendary: 'bg-gradient-to-br from-trophy-g1-legendary to-trophy-g2-legendary',
}

/** Accent text: the second half of the trophy name, the rarity dot, stat figures. */
export const RARITY_ACCENT: Record<BadgeRarity, string> = {
  common: 'text-rarity-common',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
  legendary: 'text-rarity-legendary',
}

/** Rarity pill on the dark card: tinted fill, matching border, bright text. */
export const RARITY_CHIP: Record<BadgeRarity, string> = {
  common: 'bg-rarity-common/15 border-rarity-common/30 text-rarity-common',
  uncommon: 'bg-rarity-uncommon/15 border-rarity-uncommon/30 text-rarity-uncommon',
  rare: 'bg-rarity-rare/15 border-rarity-rare/30 text-rarity-rare',
  epic: 'bg-rarity-epic/15 border-rarity-epic/30 text-rarity-epic',
  legendary: 'bg-rarity-legendary/20 border-rarity-legendary/45 text-rarity-legendary',
}

/**
 * The tinted bloom behind the artwork — a heavily blurred disc, not a radial
 * gradient, because a blur of a solid circle renders the same falloff with one
 * utility instead of a custom gradient stop. Intensity climbs with rarity so a
 * legendary reads from across a scrolling grid.
 */
export const RARITY_BLOOM: Record<BadgeRarity, string> = {
  common: 'bg-rarity-common/25',
  uncommon: 'bg-rarity-uncommon/35',
  rare: 'bg-rarity-rare/40',
  epic: 'bg-rarity-epic/40',
  legendary: 'bg-rarity-legendary/55',
}

/**
 * A tighter, hotter disc sitting inside the bloom. Two overlapping blurs make
 * a falloff that reads as light coming off the trophy; one flat disc, however
 * strong, reads as a coloured rectangle behind it.
 */
export const RARITY_CORE: Record<BadgeRarity, string> = {
  common: 'bg-rarity-common/25',
  uncommon: 'bg-rarity-uncommon/40',
  rare: 'bg-rarity-rare/45',
  epic: 'bg-rarity-epic/45',
  legendary: 'bg-rarity-legendary/60',
}

/** Card border. Legendary is the only one that reads as lit rather than outlined. */
export const RARITY_EDGE: Record<BadgeRarity, string> = {
  common: 'border-trophy-ink/10',
  uncommon: 'border-rarity-uncommon/20',
  rare: 'border-rarity-rare/25',
  epic: 'border-rarity-epic/30',
  legendary: 'border-rarity-legendary/50 shadow-[0_0_28px_-6px_rgba(255,215,92,0.45)]',
}

/**
 * Tint for the pointer-following glare, fed to `--glare-tint` as an inline
 * style. Raw `var()` references rather than utility classes because this ends
 * up inside a color-mix() in .trophy-glare, not on a `bg-`/`text-` property.
 */
export const RARITY_GLARE_TINT: Record<BadgeRarity, string> = {
  common: 'var(--color-rarity-common)',
  uncommon: 'var(--color-rarity-uncommon)',
  rare: 'var(--color-rarity-rare)',
  epic: 'var(--color-rarity-epic)',
  legendary: 'var(--color-rarity-legendary)',
}

/** Halo on the image itself. Kept subtle — the bloom behind it does the work. */
export const RARITY_GLOW: Record<BadgeRarity, string> = {
  common: '',
  uncommon: '',
  rare: '',
  epic: '',
  legendary: 'drop-shadow-[0_0_14px_rgba(255,215,92,0.45)]',
}

export const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'diamond']

export const TIER_LABEL: Record<BadgeTier, Copy> = {
  bronze: msg`Bronze`,
  silver: msg`Silver`,
  gold: msg`Gold`,
  diamond: msg`Diamond`,
}

/**
 * Tier accent — the tier label and the fallback icon, both on the trophy card.
 *
 * Was improvised from the brand ramps and read badly: "silver" as
 * ktip-sand-400 is a warm beige, and bronze/silver differed by one step of the
 * same neutral. These are the metal-* tokens, which flip with the card ground.
 */
export const TIER_ACCENT: Record<BadgeTier, string> = {
  bronze: 'text-metal-bronze',
  silver: 'text-metal-silver',
  gold: 'text-metal-gold',
  diamond: 'text-metal-diamond',
}

/** Tier chip on the dark card. Sits beside the rarity chip. */
export const TIER_CHIP: Record<BadgeTier, string> = {
  bronze: 'bg-metal-bronze/15 border-metal-bronze/30 text-metal-bronze',
  silver: 'bg-metal-silver/15 border-metal-silver/30 text-metal-silver',
  gold: 'bg-metal-gold/15 border-metal-gold/30 text-metal-gold',
  diamond: 'bg-metal-diamond/15 border-metal-diamond/30 text-metal-diamond',
}

/** Human label for a check_key, used in progress bars. */
export function rarityOf(rarity?: BadgeRarity | null): BadgeRarity {
  return rarity && RARITY_ORDER.includes(rarity) ? rarity : 'common'
}
