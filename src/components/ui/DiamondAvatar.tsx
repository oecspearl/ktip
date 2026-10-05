import type { CSSProperties, ReactNode } from 'react'
import { cn, generateAvatarColor, getInitials } from '../../lib/utils'
import { useUploadVariant } from '../../hooks/useUploadVariant'
import { AVATAR_VARIANT_WIDTH } from '../../lib/upload-variants'

/**
 * Largest footprint that draws from the 128px sibling instead of the 512px
 * original. The photo paints at ~1.03× the footprint (the inner layer is
 * overscanned, see `.dm-*` in index.css), so 48 asks ~148 device px of a DPR-3
 * phone — near enough to 128 that a face holds. Above it, the original.
 */
const VARIANT_MAX_SIZE = 48

interface DiamondAvatarProps {
  /** Photo URL. Falls back to initials when absent. */
  src?: string | null
  /** Display name — drives the initials, the tint and the alt text. */
  name: string
  /**
   * Footprint in px — the box the diamond occupies in layout, so it drops into
   * a row where a `w-10 h-10` circle used to sit without moving anything. The
   * tilted square inside is `size / √2`.
   */
  size?: number
  /** Overrides the name-derived tint behind the initials. */
  colorClass?: string
  /** Extra classes on the wrapper (positioning, margins, ring offsets). */
  className?: string
  /** Extra classes on the tilted frame — borders, shadows, rings. */
  frameClassName?: string
  /** Replaces the initials when there is no photo — a group or placeholder glyph. */
  icon?: ReactNode
  /** Hover/focus scrim contents — counter-rotated by `.dm-ov > *`. */
  overlay?: ReactNode
  /** Renders as a button when set. */
  onClick?: () => void
  title?: string
  /** Status dots, rank chips — rendered outside the frame so they stay level and unclipped. */
  children?: ReactNode
}

/**
 * The app's person avatar: a square tilted 45°.
 *
 * One free variable (`--s`, the square's side) drives the radius, the reserved
 * bounding box and the type scale, so a caller passes one number instead of
 * keeping three values in sync. The geometry lives in `.dm-*` in index.css —
 * see the comment there for why the inner layer is overscanned.
 *
 * Decorations belong in `children`, not inside the frame: the frame clips to
 * the diamond and tilts its contents, which is right for a photo and wrong for
 * a status dot.
 */
export function DiamondAvatar({
  src,
  name,
  size = 48,
  colorClass,
  className,
  frameClassName,
  icon,
  overlay,
  onClick,
  title,
  children,
}: DiamondAvatarProps) {
  // --s is the square's side; the wrapper re-expands it to `size` via the same
  // √2 in index.css. Callers think in footprint, the CSS thinks in side.
  const side = size / 1.414
  const style = { '--s': `${side}px` } as CSSProperties
  const interactive = !!onClick || !!overlay
  // Lists of 20–50 avatars each fetched the full 512px upload. Uploads without
  // a sibling yet fall back to the original on their first 404.
  const photo = useUploadVariant(src, size <= VARIANT_MAX_SIZE ? { width: AVATAR_VARIANT_WIDTH } : null)

  const frame = (
    <div
      className={cn(
        'dm-frame',
        // generateAvatarColor indexes on charCodeAt(0), which is NaN for the
        // empty name a still-loading record hands us.
        !src && (colorClass || (name ? generateAvatarColor(name) : 'bg-ktip-sand-300')),
        frameClassName
      )}
    >
      {src ? (
        <img
          className="dm-inner"
          src={photo.src}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={photo.onError}
        />
      ) : icon ? (
        <span className="dm-inner text-white" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <span
          className="dm-inner font-bold text-white"
          style={{ fontSize: Math.max(9, Math.round(side * 0.34)) }}
          aria-hidden="true"
        >
          {getInitials(name)}
        </span>
      )}
      {overlay ? <span className="dm-ov">{overlay}</span> : null}
    </div>
  )

  const wrapperClass = cn('dm-wrap', interactive && 'dm-interactive', className)

  if (onClick) {
    return (
      <button
        type="button"
        className={wrapperClass}
        style={style}
        onClick={onClick}
        title={title || name}
        aria-label={title || name}
      >
        {frame}
        {children}
      </button>
    )
  }

  return (
    <span className={wrapperClass} style={style} title={title}>
      {frame}
      {children}
      {!src && <span className="sr-only">{name}</span>}
    </span>
  )
}
