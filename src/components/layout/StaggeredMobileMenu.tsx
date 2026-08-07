import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/utils'

interface StaggeredMobileMenuProps {
  open: boolean
  onClose: () => void
  /** Label read out for the drawer itself */
  label: string
  /** Translated label for the scrim and the panel's own close control */
  closeLabel: string
  /**
   * Each direct child is one stagger unit — a tile, a card, a section. Group
   * anything that should move together into a single element.
   *
   * A child that has to size itself in the body's layout (a bento tile
   * declaring its column span) carries the classes on a `data-span` prop: the
   * stagger wrapper sits between the body and the child, so a `col-span-*` on
   * the child itself would be resolving against the wrapper, not the grid.
   */
  children: ReactNode
  /** Layout for the scrolling body — a bento grid, a plain column, whatever */
  bodyClassName?: string
  /** Shown top-left in the panel header, where the bar's own brand sits */
  brand?: ReactNode
  /**
   * Changes whenever a child changes size or span. That is the cue to FLIP the
   * mosaic so the tiles that get pushed around glide instead of jumping.
   */
  layoutKey?: string | number | null
  /**
   * A child is expanded and wants the whole screen. The panel widens rather
   * than making the expanded card scroll inside a third of the viewport.
   */
  expanded?: boolean
}

/**
 * Colour slabs that lead the panel in. They carry no content and never take a
 * pointer event; they exist so the drawer arrives as a sweep of brand colour
 * rather than a single rectangle appearing.
 */
const PRELAYERS = ['bg-ktip-tropical-500', 'bg-ktip-ocean-500']

// power4.out — the ease every stage of the open sequence shares
const EASE_OUT = 'ease-[cubic-bezier(0.16,1,0.3,1)]'
// power3.in — closing is one motion, faster and accelerating away
const EASE_IN = 'ease-[cubic-bezier(0.55,0,1,0.45)]'

const PANEL_DELAY = 140 // ms; after the last slab has started
const ROWS_START = 260 // ms; a beat into the panel's own slide
const ROW_STEP = 55 // ms between consecutive rows
const CLOSE_MS = 320 // has to match the closing duration below

/**
 * The mobile navigation drawer.
 *
 * Before this the mobile menu was an inline block below the bar: it inherited
 * the bar's translucency, so hero text showed through its rows, and it had no
 * surface of its own to scroll against. It is now a real off-canvas panel with
 * a scrim, a scroll lock and a staggered entrance.
 *
 * The entrance is CSS transitions with per-element `transition-delay`, not a
 * timeline library — nothing here needs to be interruptible mid-flight, and
 * closing simply reverses every property at once with the delays dropped.
 */
export function StaggeredMobileMenu({
  open,
  onClose,
  label,
  closeLabel,
  children,
  bodyClassName,
  brand,
  layoutKey,
  expanded = false,
}: StaggeredMobileMenuProps) {
  // `rendered` keeps the drawer mounted through its closing transition;
  // `shown` is the transition target, flipped a frame after mount so the
  // browser has an "off-screen" state to animate away from.
  const [rendered, setRendered] = useState(false)
  const [shown, setShown] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const tileRects = useRef(new Map<Element, { left: number; top: number }>())
  const wasExpanded = useRef(expanded)
  // Layout-viewport height at the last measurement. See the FLIP below.
  const viewportHeight = useRef(0)

  useEffect(() => {
    if (open) {
      setRendered(true)
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }
    setShown(false)
    const timer = setTimeout(() => setRendered(false), CLOSE_MS)
    return () => clearTimeout(timer)
  }, [open])

  /**
   * The page behind a full-height drawer must not scroll with it, or the
   * gesture that reaches the end of the list carries on into the article
   * underneath and the drawer appears to drift.
   *
   * `overflow: hidden` alone does not do this on iOS Safari — touch scrolling
   * ignores it entirely, so the page kept moving under the scrim and, because
   * Safari's toolbars grow and shrink with that movement, the drawer's own
   * fixed box was still being resized right through its entrance.
   *
   * Pinning the body instead actually holds on iOS. It costs the scroll
   * position, which `position: fixed` discards, so it is parked in a local and
   * restored on unlock — the unlock runs after the closing transition, so the
   * page does not visibly jump back while the panel is still on screen.
   */
  useEffect(() => {
    if (!rendered) return
    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      window.scrollTo(0, scrollY)
    }
  }, [rendered])

  // Focus moves into the panel so the next Tab lands on the first link rather
  // than continuing through the page behind the scrim.
  useEffect(() => {
    if (!shown) return
    panelRef.current?.focus({ preventScroll: true })
  }, [shown])

  /**
   * FLIP the mosaic when a tile changes span.
   *
   * A bento tile that expands from two columns to four re-flows every tile
   * after it, and grid placement is not a transitionable property — the others
   * jump to their new cells in a single frame. So: remember where each tile was
   * (the map holds the rects measured after the previous commit), and once the
   * new layout is committed, animate each moved tile from its old offset back
   * to zero. The browser has already painted the final layout; only the
   * transform is animated, so nothing re-lays-out mid-flight.
   *
   * Runs on layoutKey, which the host changes whenever a span changes.
   *
   * Deliberately NOT on `shown`. The entrance is not a layout move — every row
   * reaches its final cell on the first commit and only its transform changes
   * after that — so there is nothing here to FLIP. Running it on `shown` was
   * the mobile jump: the seed pass measured before the scroll lock had been
   * applied, iOS then restored its toolbars in response to the lock, and the
   * second pass measured every row ~90px higher in a shorter viewport. The
   * FLIP read that as a layout move and fired a WAAPI transform on each row —
   * on the same property the entrance transition was already animating, which
   * it outranks — so the rows teleported, glided in from the wrong place, and
   * snapped when the animation handed control back. None of it reproduces in a
   * desktop viewport, where no browser chrome moves and every delta is zero.
   */
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const previous = tileRects.current
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    // The panel's own width is mid-transition on the commit that flips
    // `expanded`, so every offset measured here is stale by the full width
    // delta. That reflow is already smooth — the grid tracks the animating
    // width — so this pass only re-seeds the map and animates nothing.
    const resizing = wasExpanded.current !== expanded
    wasExpanded.current = expanded

    // Same argument for the viewport itself. A mobile browser moving its
    // toolbars resizes the layout viewport under a fixed panel, and every
    // offset in the map is stale by that delta through no fault of the layout.
    // Synchronous, rather than a resize listener: the events land whenever the
    // browser feels like it, and this pass has to know before it animates.
    const height = window.innerHeight
    const viewportChanged = viewportHeight.current !== height
    viewportHeight.current = height

    for (const child of Array.from(body.children) as HTMLElement[]) {
      // offsetLeft/Top, not getBoundingClientRect: the wrappers carry an
      // entrance transform, and a measurement that includes it would read the
      // stagger's own 2rem lift as a layout move and fight the transition.
      const next = { left: child.offsetLeft, top: child.offsetTop }
      const last = previous.get(child)
      previous.set(child, next)
      if (!last || reduced || resizing || viewportChanged) continue
      const dx = last.left - next.left
      const dy = last.top - next.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      child.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        // Tracks the panel's own width transition and the cards' 450ms open, so
        // the mosaic reflow and the card that caused it move as one gesture.
        { duration: 450, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      )
    }
  }, [layoutKey, expanded])

  if (!rendered) return null

  const rows = Children.toArray(children)

  return (
    <div
      data-staggered-menu
      /* Above the navbar (z-nav), so the panel is not sliced by the bar and the
         scrim can dim it too. The bar's own hamburger is therefore covered
         while the drawer is open — the panel carries its own close button in
         the same corner so the tap target does not move. */
      className="fixed inset-0 z-drawer lg:hidden"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className={cn(
          'absolute inset-0 w-full cursor-default bg-ktip-ink/60 backdrop-blur-[2px] transition-opacity duration-300',
          shown ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* fixed, not absolute, and sized in vw: an ancestor that is wider than
          the viewport (a page with any horizontal overflow) was giving the
          panel 26rem to fill and letting the surplus hang off the right edge
          on a 393px phone. Viewport units cannot be handed a wrong box.

          It widens to the whole screen while a category is expanded, so the
          entries have the room the mosaic cannot give them at 26rem — most
          visible in landscape, where the drawer is a third of the width.

          svh, not inset-y-0: a mobile browser's fixed box is the layout
          viewport, which on iOS is the tall one until the toolbars come back.
          The panel got that height for the frames between opening and the
          scroll lock landing, so its last tiles sat under the bottom toolbar
          and could not be reached. The small viewport is the one that is
          always visible, and once the lock holds it is the one in force
          anyway — so this is the height the panel had been settling on, just
          without the frames of overshoot on the way there. */}
      <div
        className={cn(
          'fixed right-0 top-0 h-[100svh] transition-[width] duration-[520ms]',
          EASE_OUT,
          expanded
            ? 'w-screen'
            : 'w-[min(26rem,100vw)] landscape-short:w-[min(34rem,100vw)]'
        )}
      >
        {/* Leading colour slabs */}
        {PRELAYERS.map((color, i) => (
          <div
            key={color}
            aria-hidden="true"
            className={cn(
              'absolute inset-0 transition-transform duration-500',
              color,
              shown ? `translate-x-0 ${EASE_OUT}` : `translate-x-full ${EASE_IN}`
            )}
            style={{ transitionDelay: shown ? `${i * 70}ms` : '0ms' }}
          />
        ))}

        {/* Panel */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={cn(
            // neu-on-dark: the soft-UI pair inside this panel has to be the
            // dark-backdrop one. The light pair paints a near-white highlight,
            // which on navy is the white bloom that was blowing out from under
            // the Log In / Sign Up buttons. Same fix the navbar itself uses.
            'neu-on-dark absolute inset-0 flex flex-col bg-ktip-ink shadow-hard outline-none',
            'transition-transform',
            shown
              ? `translate-x-0 duration-[650ms] ${EASE_OUT}`
              : `translate-x-full duration-[320ms] ${EASE_IN}`
          )}
          style={{ transitionDelay: shown ? `${PANEL_DELAY}ms` : '0ms' }}
        >
          {/* Same height and corner as the bar's hamburger, so the control the
              drawer covers is replaced by one in the identical spot. */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 landscape-short:h-12">
            {/* The bar's own brand, repeated: the drawer covers the header, and
                a lone "MENU" where the logo had been read as a different app. */}
            {brand ?? (
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                {label}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="flex items-center gap-2 rounded-lg p-2 text-white transition-colors hover:bg-white/10"
            >
              <StaggeredMenuIcon open={shown} />
            </button>
          </div>

          <div ref={bodyRef} className={cn('flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pt-3 pb-6 landscape-short:pt-2 landscape-short:pb-3', bodyClassName)}>
            {rows.map((row, i) => (
              <div
                key={i}
                className={cn(
                  'min-w-0 transition-[transform,opacity] duration-[600ms]',
                  isValidElement<{ 'data-span'?: string }>(row) ? row.props['data-span'] : undefined,
                  shown
                    ? `translate-y-0 opacity-100 ${EASE_OUT}`
                    : `translate-y-8 opacity-0 ${EASE_IN}`
                )}
                style={{ transitionDelay: shown ? `${ROWS_START + i * ROW_STEP}ms` : '0ms' }}
              >
                {row}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The bar's hamburger, in three beats rather than an icon swap: the middle
 * rule slides out to the right, the outer two converge into a cross, and only
 * then does the whole glyph spin. Closing runs the same beats in reverse —
 * every delay below is mirrored, which is why they are written out per state
 * instead of being shared.
 */
export function StaggeredMenuIcon({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative block h-4 w-5 transition-transform',
        open
          ? `rotate-180 duration-[550ms] delay-[280ms] ${EASE_OUT}`
          : `rotate-0 duration-[350ms] delay-0 ${EASE_IN}`
      )}
    >
      {/* Top rule → the "\" of the cross */}
      <span
        className={cn(
          'absolute left-0 h-[2px] w-5 rounded-full bg-current transition-all duration-300',
          open ? `top-1/2 -translate-y-1/2 rotate-45 delay-[150ms] ${EASE_OUT}` : `top-0 rotate-0 delay-[120ms] ${EASE_IN}`
        )}
      />
      {/* Middle rule — leaves first, comes back last */}
      <span
        className={cn(
          'absolute left-0 top-1/2 h-[2px] w-5 -translate-y-1/2 rounded-full bg-current transition-all duration-200',
          open ? 'translate-x-6 opacity-0 delay-0' : 'translate-x-0 opacity-100 delay-[280ms]'
        )}
      />
      {/* Bottom rule → the "/" of the cross */}
      <span
        className={cn(
          'absolute left-0 h-[2px] w-5 rounded-full bg-current transition-all duration-300',
          open
            ? `top-1/2 -translate-y-1/2 -rotate-45 delay-[150ms] ${EASE_OUT}`
            : `top-full -translate-y-full rotate-0 delay-[120ms] ${EASE_IN}`
        )}
      />
    </span>
  )
}
