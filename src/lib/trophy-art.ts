import { TIER_ORDER } from './achievement-style'
import type { BadgeTier } from '../types'

/**
 * Trophy artwork bundled with the app.
 *
 * WHY THIS EXISTS AT ALL
 * `trophy_assets` is admin-editable and starts empty, so before this file the
 * entire gallery rendered lucide fallback icons. Shipping the artwork as static
 * assets means a fresh database looks finished, an offline dev has real images,
 * and nobody has to upload 48 files through an admin form to get a working
 * screen.
 *
 * It sits BELOW the database in resolveTrophy()'s chain — a coordinator who
 * uploads replacement art through /admin/achievements still wins. This is the
 * default, not the override.
 *
 * The ladder is complete: all 12 types have all 4 tiers. ladder()'s `absent`
 * parameter stays for the next gap — a type added before its art lands should
 * record the missing tiers as explicit nulls, not omit the key, so the gap is
 * a fact in the code rather than something inferred. A null falls through to
 * the lucide icon, which is exactly what the fallback is for.
 *
 * Sources live in public/trophies/ at 512px (the largest any call site renders
 * at DPR 3). The build generates 192/384 AVIF + WebP variants from them; see
 * LADDERS.trophies in image-variants.ts.
 */

export const TROPHY_TYPES = [
  'rocket',
  'wave',
  'handshake',
  'seedling',
  'megaphone',
  'podium',
  'flame',
  'weave',
  'crown',
  'key',
  'lighthouse',
  'compass-rose',
] as const

export type TrophyType = (typeof TROPHY_TYPES)[number]

type TierArt = Record<BadgeTier, string | null>

function ladder(type: TrophyType, absent: BadgeTier[] = []): TierArt {
  const out = {} as TierArt
  for (const tier of TIER_ORDER) {
    out[tier] = absent.includes(tier) ? null : `/trophies/${type}-${tier}.webp`
  }
  return out
}

/**
 * Keyed on Record<TrophyType, …> on purpose: adding a slug to TROPHY_TYPES
 * without adding its row here is a compile error, so the two cannot drift.
 */
const BUNDLED: Record<TrophyType, TierArt> = {
  rocket: ladder('rocket'),
  wave: ladder('wave'),
  handshake: ladder('handshake'),
  seedling: ladder('seedling'),
  megaphone: ladder('megaphone'),
  podium: ladder('podium'),
  flame: ladder('flame'),
  weave: ladder('weave'),
  crown: ladder('crown'),
  key: ladder('key'),
  lighthouse: ladder('lighthouse'),
  'compass-rose': ladder('compass-rose'),
}

/**
 * The bundled 512px source for a trophy, or null if there is none.
 *
 * Untiered badges resolve to gold, matching resolveTrophy(): gold is the
 * neutral middle of the ladder and reads as a plain trophy rather than a rank.
 * An unknown type (a slug an admin invented, or one retired from the code but
 * still on a row) returns null rather than a 404 image.
 */
export function bundledTrophyArt(
  trophyType?: string | null,
  tier?: BadgeTier | null
): string | null {
  if (!trophyType) return null
  const art = BUNDLED[trophyType as TrophyType]
  return art ? art[tier || 'gold'] : null
}
