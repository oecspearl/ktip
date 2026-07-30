import { useEffect, useState } from 'react'

interface ViewportScaleOptions {
  /** CSS width the UI was authored against */
  width: number
  /**
   * Authored CSS height. Pass it for UI that is locked to the viewport height
   * (the hero) so a wide-but-short window scales down instead of overflowing.
   * Omit it for corner-anchored UI (the FAB), where height is irrelevant.
   */
  height?: number
  /** Floor — below this the UI stops being readable/tappable */
  min?: number
  /** Ceiling — keeps an unscaled 4K panel from rendering everything oversized */
  max?: number
}

/**
 * One multiplier for a whole block of UI, so it holds its authored proportions
 * on any display.
 *
 * The pattern: set `fontSize: 16 * scale` on the block's root and express every
 * length inside it in `em`. Type, padding, gaps, and component sizes then move
 * together as one piece.
 *
 * Why not per-property `clamp()`: each property gets its own interpolation
 * curve, so the ratios between them drift as the viewport changes and the
 * layout stops looking authored — a headline that shrank 30% next to a card
 * that shrank 12%. A single factor cannot drift.
 *
 * Note that an `em` length on an element that also sets `font-size` resolves
 * against that new size, so it compounds — divide by the font-size factor when
 * both live on one element (`text-[0.875em]` + 28px of padding → `px-[2em]`).
 */
export function useViewportScale({ width, height, min = 0.6, max = 1 }: ViewportScaleOptions) {
  const [scale, setScale] = useState(() =>
    typeof window === 'undefined'
      ? Math.min(1, max)
      : scaleFor(window.innerWidth, window.innerHeight, width, height, min, max),
  )

  useEffect(() => {
    const update = () =>
      setScale(scaleFor(window.innerWidth, window.innerHeight, width, height, min, max))
    // Run once on mount: SSR/hydration starts from the fallback above, and OS
    // display-scaling changes arrive as a resize with no other signal
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [width, height, min, max])

  return scale
}

function scaleFor(
  vw: number,
  vh: number,
  width: number,
  height: number | undefined,
  min: number,
  max: number,
) {
  const byWidth = vw / width
  const s = height ? Math.min(byWidth, vh / height) : byWidth
  return Math.min(max, Math.max(min, s))
}
