import { useLayoutEffect, useRef, type RefObject } from 'react'
import { DISCLOSURE_ENTER_MS } from './useDisclosureAnimation'

interface Box {
  left: number
  top: number
  width: number
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * Animate a container's children between two layouts.
 *
 * The FLIP move: read where each child was, let React lay out the new frame,
 * read where it is now, then put it back with a transform and release it. The
 * browser animates the release, so the element travels from its old place to
 * its real one without either being faked.
 *
 * Two things are animated, because a role card does two things when chosen:
 *
 *   - It moves. The chosen card spans the full row and every card after it
 *     wraps to a different cell. Position is animated with a transform, which
 *     costs nothing to composite.
 *   - It resizes. The chosen card goes from half the row to all of it, and back
 *     on deselect. Width is animated as a real `width` tween rather than a
 *     scale, so the text inside re-wraps instead of stretching. A transform
 *     would be cheaper, but a stretched word is worse than a re-layout that
 *     lasts a fifth of a second.
 *
 * Height is deliberately NOT measured or animated here. The card's height
 * changes because its description is folding open, and `.disclosure-collapse`
 * already animates that from content height. Tweening the box as well would
 * fight it.
 *
 * Children opt in with `data-flip-key`, a stable identity across renders.
 * Anything without one is left alone. Under `prefers-reduced-motion` positions
 * are still recorded — so the first move after the preference changes is
 * measured from somewhere real — but nothing is animated.
 */
export function useFlipChildren(
  ref: RefObject<HTMLElement | null>,
  dep: unknown,
  ms: number = DISCLOSURE_ENTER_MS
) {
  const previous = useRef(new Map<string, Box>())

  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const next = new Map<string, Box>()
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const child of Array.from(host.children)) {
      if (!(child instanceof HTMLElement)) continue
      const key = child.dataset.flipKey
      if (!key) continue

      // Measure the settled box, not one mid-tween from a click that landed
      // during the previous animation.
      child.style.transition = 'none'
      child.style.transform = ''
      child.style.width = ''
      child.style.overflow = ''

      const rect = child.getBoundingClientRect()
      const box = { left: rect.left, top: rect.top, width: rect.width }
      next.set(key, box)

      const was = previous.current.get(key)
      if (!was || reduced) continue

      const dx = was.left - rect.left
      const dy = was.top - rect.top
      const dw = was.width - rect.width
      if (dx === 0 && dy === 0 && dw === 0) continue

      // Invert: put it back where and how big it was, with no transition.
      if (dx || dy) child.style.transform = `translate(${dx}px, ${dy}px)`
      if (dw) {
        child.style.width = `${was.width}px`
        // A card shrinking from the full row still holds its open description
        // for the first frames; clipping keeps that text from spilling over the
        // neighbour sliding into the space.
        child.style.overflow = 'hidden'
      }

      // Force the inverted styles to be applied before the transition is
      // armed — without this read the writes collapse into one frame and
      // nothing animates.
      void child.offsetWidth

      // Play: release it, and let the browser walk it home.
      child.style.transition = `transform ${ms}ms ${EASE}, width ${ms}ms ${EASE}`
      child.style.transform = ''
      if (dw) child.style.width = `${rect.width}px`

      timers.push(
        setTimeout(() => {
          child.style.transition = ''
          child.style.width = ''
          child.style.overflow = ''
        }, ms)
      )
    }

    previous.current = next

    return () => {
      for (const t of timers) clearTimeout(t)
    }
  }, [ref, dep, ms])
}
