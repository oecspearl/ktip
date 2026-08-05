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
  /**
   * A separate, usually lower floor for the HEIGHT term. Defaults to `min`.
   *
   * `min` exists for narrow screens, where the width term collapses — a phone
   * divides 375 by an authored ~1739 and lands near 0.2, which would render the
   * whole block unusable. Height never collapses like that: a phone is TALL, so
   * its height term sits comfortably above the floor and the floor is only ever
   * reached by a short-and-wide window — a laptop whose browser chrome leaves
   * ~610px. There the floor is not protecting anything, it is forcing the block
   * to render taller than the space it was given, which is the one thing a
   * height-fitted block must never do.
   *
   * Splitting the two floors lets a short window scale down to fit while a
   * narrow one still gets the protection the floor was written for.
   */
  heightMin?: number
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
 *
 * SCOPE. The app now sizes itself from the --scale-* ramps and the --text-* /
 * --spacing-* tokens in index.css, which are stepped by media query and cover
 * everything a width ladder can express. This hook remains for the two blocks
 * that a width ladder cannot: both pass `height`, so they fit to the viewport's
 * HEIGHT, and no `@media (min-width: …)` step can describe that.
 *
 *   - pages/discover/DiscoverPage — the full-bleed hero
 *   - components/ui/FloatingActionButton — the dock
 *
 * Those two are deliberate exceptions. Anything else reaching for this hook
 * almost certainly wants a token instead.
 */
export function useViewportScale({
  width,
  height,
  min = 0.6,
  heightMin,
  max = 1,
}: ViewportScaleOptions) {
  const hMin = heightMin ?? min
  const [scale, setScale] = useState(() =>
    typeof window === 'undefined'
      ? Math.min(1, max)
      : scaleFor(window.innerWidth, window.innerHeight, width, height, min, hMin, max),
  )

  useEffect(() => {
    const update = () =>
      setScale(scaleFor(window.innerWidth, window.innerHeight, width, height, min, hMin, max))
    // Run once on mount: SSR/hydration starts from the fallback above, and OS
    // display-scaling changes arrive as a resize with no other signal
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [width, height, min, hMin, max])

  return scale
}

function scaleFor(
  vw: number,
  vh: number,
  width: number,
  height: number | undefined,
  min: number,
  heightMin: number,
  max: number,
) {
  const w = Math.max(vw / width, min)
  if (!height) return Math.min(max, w)
  // Each term is floored on its own BEFORE they meet, rather than once after.
  // Flooring the minimum of the two would let the width floor override a height
  // term that is legitimately lower, which is exactly the short-laptop case:
  // 1280x610 wants 0.61 from its height and gets held at 0.70 by a floor
  // written for phones, so the block renders ~15% taller than the viewport it
  // must fit in. Nothing re-applies `min` afterwards for the same reason.
  return Math.min(max, w, Math.max(vh / height, heightMin))
}
