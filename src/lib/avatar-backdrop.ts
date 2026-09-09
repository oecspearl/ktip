/**
 * Avatar style (migration 148) — what sits behind a member's cut-out portrait.
 *
 * Mirrors banner.ts deliberately: one JSONB spec on the profile row, three
 * kinds discriminated by `kind`, and a parser that degrades anything malformed
 * to the plain photo, because the column is client-owned.
 *
 *   { kind: 'photo' }                          the upload as it was, no cut
 *   { kind: 'backdrop', id, cutout, side, frame, animated? }   built-in art
 *   { kind: 'gradient', colors, seed?, cutout, side, frame, animated? }
 *
 * `avatar_url` stays ONE opaque image (the cut-out composited on the backdrop
 * and framed to the head), so the 50-odd DiamondAvatar call sites never change.
 * The two cut-out kinds additionally carry:
 *
 * - `cutout` — public URL of the subject on transparency. The member page hero
 *   draws this large, over its own live aurora, instead of the baked square.
 * - `side` — where the head sits in the photo (left / centre / right). The
 *   hero puts the name on the other side.
 * - `frame` — the head-centred square crop used for the diamond, so changing
 *   backdrop is a re-composite of the stored cut-out and never a re-upload.
 * - `animated` — whether the hero's aurora drifts. Presentation only.
 * - `source` — the untouched upload, so reverting to it is a copy.
 *
 * The built-in backdrops ARE the banner designs: same aurora family, same
 * names, so a member's avatar and banner look like they came from one place.
 */

import { PRESET_BANNERS, type BannerSpec, type PresetBanner } from './banner'
import type { PortraitFrame, SubjectSide } from './portrait-mask'

export type AvatarStyle =
  | { kind: 'photo' }
  | {
      kind: 'backdrop'
      id: string
      cutout: string
      side: SubjectSide
      frame: PortraitFrame
      animated?: boolean
      /** Public URL of the untouched upload; revert copies it back over avatar_url. */
      source?: string
    }
  | {
      kind: 'gradient'
      colors: string[]
      seed?: number
      cutout: string
      side: SubjectSide
      frame: PortraitFrame
      animated?: boolean
      source?: string
    }

export type CutoutStyle = Exclude<AvatarStyle, { kind: 'photo' }>

export const PHOTO_STYLE: AvatarStyle = { kind: 'photo' }

/** Built-in backdrops — the banner designs, cropped square by object-fit. */
export const AVATAR_BACKDROPS: PresetBanner[] = PRESET_BANNERS

const BACKDROP_BY_ID = new Map(AVATAR_BACKDROPS.map((b) => [b.id, b]))

/** Starting palette for the gradient builder — brand green over ocean. */
export const DEFAULT_AVATAR_GRADIENT = ['#2A5788', '#97D700', '#8FB4DC']

const SIDES = new Set<string>(['left', 'center', 'right'])

function parseFrame(value: unknown): PortraitFrame | null {
  if (!value || typeof value !== 'object') return null
  const f = value as Record<string, unknown>
  const nums = [f.x, f.y, f.s]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const x = f.x as number
  const y = f.y as number
  const s = f.s as number
  if (x < 0 || y < 0 || s <= 0 || s > 1 || x > 1 || y > 1) return null
  return { x, y, s }
}

/**
 * Parse whatever profiles.avatar_style holds. Anything short of a complete,
 * well-typed cut-out spec is the plain photo — a half-written style must never
 * make the hero try to draw a cut-out it does not have.
 */
export function parseAvatarStyle(value: unknown): AvatarStyle {
  if (!value || typeof value !== 'object') return PHOTO_STYLE
  const v = value as Record<string, unknown>
  if (v.kind === 'photo') return PHOTO_STYLE

  if (v.kind !== 'backdrop' && v.kind !== 'gradient') return PHOTO_STYLE
  if (typeof v.cutout !== 'string' || !v.cutout) return PHOTO_STYLE
  if (typeof v.side !== 'string' || !SIDES.has(v.side)) return PHOTO_STYLE
  const frame = parseFrame(v.frame)
  if (!frame) return PHOTO_STYLE
  const animated = v.animated === true ? true : undefined
  const source = typeof v.source === 'string' && v.source ? v.source : undefined

  if (v.kind === 'backdrop') {
    if (typeof v.id !== 'string' || !BACKDROP_BY_ID.has(v.id)) return PHOTO_STYLE
    return { kind: 'backdrop', id: v.id, cutout: v.cutout, side: v.side as SubjectSide, frame, animated, source }
  }

  if (
    !Array.isArray(v.colors) ||
    v.colors.length < 2 ||
    v.colors.length > 4 ||
    !v.colors.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
  )
    return PHOTO_STYLE
  return {
    kind: 'gradient',
    colors: v.colors as string[],
    seed: typeof v.seed === 'number' ? v.seed : undefined,
    cutout: v.cutout,
    side: v.side as SubjectSide,
    frame,
    animated,
    source,
  }
}

export function isCutoutStyle(style: AvatarStyle): style is CutoutStyle {
  return style.kind !== 'photo'
}

/** Image URL for the built-in backdrop kind; null otherwise. */
export function avatarBackdropImage(style: AvatarStyle): string | null {
  if (style.kind !== 'backdrop') return null
  return BACKDROP_BY_ID.get(style.id)?.url ?? null
}

/** The aurora spec a gradient style renders with — same shape BannerAurora takes. */
export function avatarGradientSpec(
  style: Extract<AvatarStyle, { kind: 'gradient' }>
): { kind: 'gradient'; colors: string[]; seed?: number } {
  return { kind: 'gradient', colors: style.colors, seed: style.seed }
}

/**
 * The banner a backdrop IS.
 *
 * The two specs were always the same artwork under two names — AVATAR_BACKDROPS
 * is PRESET_BANNERS, id for id, and both gradient kinds carry the same colours
 * and seed. So a member choosing what they stand on has, by that act, chosen
 * what goes behind them everywhere else, and asking them again in a second
 * dialog only created the chance to answer differently and end up with a face
 * that disappears into its own cover.
 *
 * The plain photo has nothing behind it, so it has no banner: the hero falls
 * back to the member's own photo, blurred, which is what it does for a member
 * who never set one.
 */
export function bannerFromAvatarStyle(style: AvatarStyle): BannerSpec | null {
  if (style.kind === 'backdrop') return { kind: 'preset', id: style.id }
  if (style.kind === 'gradient') return { kind: 'gradient', colors: style.colors, seed: style.seed }
  return null
}

/**
 * Storage keys under the member's avatars folder. Three objects, one folder —
 * the folder-prefix policies in 006 already cover all of them.
 */
export const avatarKeys = (userId: string) => ({
  /** The photo as uploaded, optimized. Revert copies this back over `avatar`. */
  source: `${userId}/avatar-source`,
  /** Subject on transparency — what the hero draws. */
  cutout: `${userId}/avatar-cutout`,
  /** The composite every DiamondAvatar reads. This is `avatar_url`. */
  avatar: `${userId}/avatar`,
})
