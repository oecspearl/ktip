import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import { getGhostPrefs, subscribeGhostPrefs } from '../lib/ghost-mode'
import { useBackdropTone, type BackdropTone } from './useBackdropTone'

/** How far outside the surface the cursor still counts as "near it". Matches
 *  the glow's own outset in index.css, so the light comes up as the cursor
 *  reaches the halo rather than only once it is over the paper. */
const APPROACH_PX = 24

interface UseGhostModeOptions {
  /** Usually the surface's pinned flag. False disables ghosting outright. */
  enabled: boolean
  ref: RefObject<HTMLElement | null>
}

export interface GhostMode {
  /** Faded, click-through, waiting to be woken. */
  ghosted: boolean
  /** The opacity to fade to. */
  opacity: number
  /** What is behind the ghost right now. A glow has to be chosen against it:
   *  a mid navy edge over a dark hero photo is not an edge. */
  tone: BackdropTone
  wake: () => void
}

/**
 * Ghost mode for a pinned surface.
 *
 * While ghosted the element is `pointer-events: none`, so it cannot be hovered
 * in the ordinary way — every event lands on the page behind it. Proximity is
 * therefore worked out here instead: one document-level `pointermove`,
 * throttled to a frame, hit-testing the element's own rect.
 *
 * That frame writes `--cursor-angle` and `--edge-proximity` onto the element
 * imperatively and renders nothing. They drive the edge glow in CSS and change
 * at pointer rate — through React state they would re-render the panel and
 * every note inside it sixty times a second to move a gradient.
 */
export function useGhostMode({ enabled, ref }: UseGhostModeOptions): GhostMode {
  const prefs = useSyncExternalStore(subscribeGhostPrefs, getGhostPrefs, getGhostPrefs)
  const [awake, setAwake] = useState(false)

  const active = enabled && prefs.enabled
  const ghosted = active && !awake
  // Only sampled while ghosted — a woken surface is opaque and owns its own
  // backdrop, so there is nothing behind it worth reading.
  const tone = useBackdropTone(ref, ghosted)

  const wake = useCallback(() => setAwake(true), [])

  // Unpinning, or switching ghost mode off, ends the cycle rather than leaving
  // a surface stuck awake for the next time it is pinned.
  useEffect(() => {
    if (!active) setAwake(false)
  }, [active])

  // The two custom properties the glow reads. No state, no renders.
  useEffect(() => {
    const el = ref.current
    if (!ghosted || !el) return

    let frame = 0
    let point: { x: number; y: number } | null = null
    /** Last written value, so the attribute is only touched when it flips —
     *  toggling it every frame would restart the pulse every frame. */
    let wasNear: boolean | null = null

    const paint = () => {
      frame = 0
      const node = ref.current
      if (!node || !point) return
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const near =
        point.x >= rect.left - APPROACH_PX &&
        point.x <= rect.right + APPROACH_PX &&
        point.y >= rect.top - APPROACH_PX &&
        point.y <= rect.bottom + APPROACH_PX
      if (near !== wasNear) {
        wasNear = near
        node.toggleAttribute('data-ghost-near', near)
      }
      if (!near) {
        node.style.setProperty('--edge-proximity', '0')
        return
      }

      // Distance from the centre expressed as a fraction of the distance to the
      // edge along the same ray: 0 dead centre, 1 on the border. Outside the
      // box it overshoots, so it clamps — the halo is already at full strength.
      const cx = rect.width / 2
      const cy = rect.height / 2
      const dx = point.x - rect.left - cx
      const dy = point.y - rect.top - cy
      const kx = dx === 0 ? Infinity : cx / Math.abs(dx)
      const ky = dy === 0 ? Infinity : cy / Math.abs(dy)
      const proximity = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1)

      // +90° so 0 points up: the mask is a cone measured from twelve o'clock.
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
      if (angle < 0) angle += 360

      node.style.setProperty('--edge-proximity', (proximity * 100).toFixed(2))
      node.style.setProperty('--cursor-angle', `${angle.toFixed(2)}deg`)
    }

    const onPointerMove = (e: PointerEvent) => {
      point = { x: e.clientX, y: e.clientY }
      if (!frame) frame = requestAnimationFrame(paint)
    }

    document.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      if (frame) cancelAnimationFrame(frame)
      el.style.setProperty('--edge-proximity', '0')
      el.removeAttribute('data-ghost-near')
    }
  }, [ghosted, ref])

  // `pointer-events: none` does not take an element out of the tab order, so a
  // ghost is still reachable by keyboard. Reaching it wakes it, rather than
  // leaving someone typing into something they cannot see.
  useEffect(() => {
    if (!ghosted) return
    const onFocusIn = (e: FocusEvent) => {
      if (ref.current?.contains(e.target as Node)) wake()
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [ghosted, ref, wake])

  // Clicking away puts it back to sleep. Modals and the FAB are not "away" —
  // the same exclusions the panel's own outside-click close already makes.
  useEffect(() => {
    if (!active || !awake) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element
      if (ref.current?.contains(target)) return
      if (target.closest('[role="dialog"]')) return
      if (target.closest('[data-fab]')) return
      // Commit first: a note's body saves on blur, and going click-through
      // would strand whatever was typed into it.
      const focused = document.activeElement
      if (focused instanceof HTMLElement && ref.current?.contains(focused)) focused.blur()
      setAwake(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [active, awake, ref])

  return { ghosted, opacity: prefs.opacity, tone, wake }
}

/**
 * A glow bright enough to find, in the surface's own hue.
 *
 * Over a dark backdrop the hue is lifted toward white; over a light one it is
 * pushed the other way and saturated, because a pale glow on a pale page is
 * nothing at all. Both ends land brighter than the hue itself — this is a
 * light source, not a border.
 */
export function ghostGlowColor(hue: string, tone: BackdropTone): string {
  return tone === 'dark'
    ? `color-mix(in srgb, ${hue} 45%, #ffffff)`
    : `color-mix(in srgb, ${hue} 78%, #0b1b2b)`
}

/** Convenience for the consumers: everything a ghosted root needs, or nothing
 *  when it is not ghosted. Spread onto the element. */
export function ghostRootProps(ghost: GhostMode) {
  return {
    'data-ghost': ghost.ghosted ? 'true' : undefined,
  } as const
}

