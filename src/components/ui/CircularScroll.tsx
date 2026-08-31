import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface CircularScrollProps {
  children: ReactNode
  /** Goes on the scroll viewport — this is where the max-height belongs. */
  className?: string
  /** Goes on each copy of the content. */
  contentClassName?: string
}

/**
 * Scroll viewport whose content wraps end to end: scrolling past the last item
 * brings the first one back around, and scrolling up past the first lands on
 * the last. The account menu uses it, where an account holding every role
 * pushes Sign Out below the fold on a short screen.
 *
 * It only loops when the content actually overflows the viewport — above that
 * height there is nothing to scroll, so the children render once, unwrapped,
 * and the menu behaves as it always did.
 *
 * The wrap is the three-copy trick: copies A and C are clones, copy B is the
 * live one, and every scroll event normalises scrollTop back into copy B's band
 * [h, 2h). The viewport only ever shows B and the top of C, so the seam is
 * never visible. Clones stay clickable — that is the whole point of showing
 * them — but are hidden from screen readers and pulled out of the tab order, so
 * the menu is announced and tabbed through exactly once.
 */
export function CircularScroll({ children, className, contentClassName }: CircularScrollProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const copyHeight = useRef(0)
  const [looping, setLooping] = useState(false)

  /**
   * offsetHeight, not getBoundingClientRect: the panel opens under a
   * scale(0.96) transform, and the rect is the *transformed* box while
   * clientHeight is the layout one. Comparing the two measures the animation
   * rather than the content.
   *
   * Runs on every render with no dependency array. The menu mounts mid-
   * animation with its role list still resolving, so a single measurement at
   * mount is the one measurement guaranteed to be wrong.
   */
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const copy = measureRef.current
    if (!viewport || !copy) return
    const h = copy.offsetHeight
    const v = viewport.clientHeight
    // A panel measured before layout settles reports zero. Reading that as
    // "fits" would latch looping off for the life of the menu.
    if (h <= 0 || v <= 0) return
    copyHeight.current = h
    // A pixel of tolerance: sub-pixel rounding should not turn a menu that fits
    // into a looping one.
    setLooping(h > v + 1)
  })

  // Re-measure on any later size change — window resize, zoom, a role switch
  // that lengthens the list.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const copy = measureRef.current
    if (!viewport || !copy) return
    const remeasure = () => {
      const h = copy.offsetHeight
      const v = viewport.clientHeight
      if (h <= 0 || v <= 0) return
      copyHeight.current = h
      setLooping(h > v + 1)
    }
    const frame = requestAnimationFrame(remeasure)
    const ro = new ResizeObserver(remeasure)
    ro.observe(viewport)
    ro.observe(copy)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  /**
   * The wrap itself, on a native listener rather than React's onScroll: scroll
   * does not bubble, so it is the one event React routes differently from the
   * rest, and this has to fire on every single scroll tick or the seam shows.
   */
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !looping) return

    // Park on copy B. Anything else and the first wheel tick jumps.
    viewport.scrollTop = copyHeight.current

    const normalise = () => {
      const h = copyHeight.current
      if (h <= 0) return
      // Idempotent: the assignment fires another scroll event, which finds the
      // position already inside the band and leaves it alone.
      if (viewport.scrollTop >= 2 * h) viewport.scrollTop -= h
      else if (viewport.scrollTop < h) viewport.scrollTop += h
    }

    viewport.addEventListener('scroll', normalise, { passive: true })
    return () => viewport.removeEventListener('scroll', normalise)
  }, [looping])

  // Reset when looping stops — the clones are gone by then and scrollTop would
  // be pointing at content that no longer exists.
  useEffect(() => {
    if (looping) return
    const viewport = viewportRef.current
    if (viewport) viewport.scrollTop = 0
  }, [looping])

  // No dependency array on purpose: the children change under us (switching
  // role re-renders the switcher), and any link that appears inside a clone has
  // to be taken out of the tab order too.
  useEffect(() => {
    if (!looping) return
    viewportRef.current
      ?.querySelectorAll<HTMLElement>(
        '[data-circular-clone] a, [data-circular-clone] button, [data-circular-clone] [tabindex]',
      )
      .forEach((el) => {
        el.tabIndex = -1
      })
  })

  return (
    <div
      ref={viewportRef}
      data-looping={looping ? '' : undefined}
      className={cn('overflow-y-auto overscroll-contain scrollbar-hide', className)}
    >
      {/* Copy A — the one that gets measured. It is the live content until the
          content outgrows the viewport, at which point it becomes a clone. */}
      <div
        ref={measureRef}
        className={contentClassName}
        aria-hidden={looping || undefined}
        data-circular-clone={looping ? '' : undefined}
      >
        {children}
      </div>

      {looping && (
        <>
          {/* Copy B — the live one, and the only band scrollTop comes to rest in. */}
          <div className={contentClassName}>{children}</div>
          {/* Copy C — what the last item wraps into. */}
          <div className={contentClassName} aria-hidden data-circular-clone>
            {children}
          </div>
        </>
      )}
    </div>
  )
}

export default CircularScroll
