import { useCallback, useEffect, useState, type RefObject } from 'react'
import { isMobileLite } from './useMediaQuery'

export type BackdropTone = 'light' | 'dark'

/** Relative luminance, sRGB → linear, per WCAG. */
function luminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function parseRgb(value: string): [number, number, number, number] | null {
  const m = value.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
}

/** What the theme says, used whenever the pixel underneath is unknowable. */
function themeTone(): BackdropTone {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Walks up from the element under the probe point looking for the first
 * ancestor that actually paints an opaque colour. Photos, gradients and
 * video give up immediately — a single computed style cannot tell us the
 * colour of the pixel behind a background-image, and guessing "light"
 * against a dark hero photo is worse than falling back to the theme.
 */
function toneAt(x: number, y: number, selfSelector: string): BackdropTone {
  const stack = document.elementsFromPoint(x, y)
  for (const el of stack) {
    if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) continue
    if (el.closest(selfSelector)) continue // our own floating chrome
    const tag = el.tagName
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'svg') return themeTone()

    for (let node: Element | null = el; node; node = node.parentElement) {
      const cs = getComputedStyle(node)
      if (cs.backgroundImage !== 'none') return themeTone()
      const rgba = parseRgb(cs.backgroundColor)
      if (!rgba) continue
      const [r, g, b, a] = rgba
      // Semi-transparent scrims let the layer below through; keep walking
      // rather than reading a 10%-white veil as a white surface.
      if (a < 0.5) continue
      return luminance(r, g, b) > 0.5 ? 'light' : 'dark'
    }
    return themeTone()
  }
  return themeTone()
}

/**
 * Reports whether the surface *behind* a fixed element is light or dark, so
 * the element can flip its own fill and stay visible. Sampled at the element's
 * centre on scroll, resize, theme flip and whenever `deps` changes.
 *
 * Deliberately conservative: anything it cannot read as a flat colour (photo,
 * gradient, map canvas) returns the theme's tone instead of a guess.
 *
 * @param ref      the element to probe under
 * @param enabled  pass false while the element is, say, expanded over its own panel
 * @param deps     extra invalidation key — route path is the usual one
 */
export function useBackdropTone(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
  deps = ''
): BackdropTone {
  const [tone, setTone] = useState<BackdropTone>(() =>
    typeof document === 'undefined' ? 'light' : themeTone()
  )

  const sample = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    setTone(toneAt(r.left + r.width / 2, r.top + r.height / 2, '[data-fab]'))
  }, [ref])

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        sample()
      })
    }

    schedule()

    /**
     * On mobile-lite the tone is sampled once per route and then left alone.
     *
     * Each sample is `getBoundingClientRect` + `document.elementsFromPoint` +
     * a `getComputedStyle` walk up the ancestor chain of every hit — three
     * separate forced layouts. It is rAF-coalesced, but the listener is
     * registered in the CAPTURE phase on window, so it also fires for every
     * inner scroller on the page, and this hook drives the FAB, which
     * MainLayout mounts on every route. That made it one of the most expensive
     * things running during a phone scroll, to decide the fill colour of a
     * single button.
     *
     * The initial sample above still runs, and `deps` (the route path) still
     * re-runs this effect, so the FAB is correct on arrival at every page. What
     * it stops doing is re-deciding mid-scroll. Desktop keeps live tracking.
     */
    if (isMobileLite()) {
      window.addEventListener('resize', schedule)
      const liteThemeWatch = new MutationObserver(schedule)
      liteThemeWatch.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      return () => {
        if (frame) cancelAnimationFrame(frame)
        window.removeEventListener('resize', schedule)
        liteThemeWatch.disconnect()
      }
    }

    // Capture phase: inner scrollers (panels, map viewports) move content under
    // the FAB without ever bubbling a scroll event to the window.
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    const themeWatch = new MutationObserver(schedule)
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      themeWatch.disconnect()
    }
  }, [enabled, sample, deps])

  return tone
}
