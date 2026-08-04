import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/utils'

/**
 * Mesh flip: the achievements gallery's in-grid detail view.
 *
 * A tile sits flush in the mesh. Clicking it flips the cell through 3D
 * (rotateY) while it flies to the viewport center and expands, with a fixed
 * veil blurring the page behind it; the back face is the full showcase card.
 * Closing (veil click, card click, Escape) plays the whole thing in reverse —
 * one CSS transition drives both directions.
 *
 * Why not the classic "translate by N cells" percentage trick: this grid is
 * taller than the viewport and its rows aren't uniform, so the geometric grid
 * center is usually off-screen. Instead the cell measures itself at click time
 * and flies to the VIEWPORT center via pixel vars (--dx/--dy/--s/--back-w,
 * consumed by the .mesh-flip rules in index.css). Body scroll is locked while
 * open so the measurement stays valid for the return flight.
 *
 * The card must stay in-flow (not portalled) or the fly-from-cell illusion
 * breaks, which means the dialog affordances Modal normally provides — focus
 * trap, Escape, scroll lock, focus restore — are replicated here.
 */

/** Same focusable selector Modal.tsx traps with. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Past the 550ms transform transition; catches a swallowed transitionend. */
const SETTLE_FALLBACK_MS = 700

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export interface MeshFlipController {
  /** Cell currently flipped open; drives .mesh-open and the veil. */
  activeId: string | null
  /**
   * Cell whose back face is mounted. Outlives activeId by one transition so
   * the card can fly home over the fading veil before the showcase unmounts.
   */
  mountedId: string | null
  open: (id: string) => void
  close: () => void
  /** Reported by the closing cell once its return flight ends. */
  settle: () => void
}

export function useMeshFlip(): MeshFlipController {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mountedId, setMountedId] = useState<string | null>(null)

  const open = useCallback((id: string) => {
    setMountedId(id)
    setActiveId(id)
  }, [])

  const close = useCallback(() => {
    setActiveId(null)
    // No transition under reduced motion, so no transitionend will ever
    // report the landing — unmount in the same breath.
    if (prefersReducedMotion()) setMountedId(null)
  }, [])

  const settle = useCallback(() => setMountedId(null), [])

  useEffect(() => {
    if (!activeId) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeId, close])

  // Scroll lock for the full mounted window, not just the open one: the
  // measured --dx/--dy stay truthful until the card has flown home.
  useEffect(() => {
    if (!mountedId) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [mountedId])

  return { activeId, mountedId, open, close, settle }
}

interface MeshFlipCellProps {
  id: string
  open: boolean
  mounted: boolean
  /**
   * Click on the front face. The page decides what activation means (open the
   * detail, or toggle a pin while pinning) — the cell only premeasures its
   * flight vars so an open can start from a truthful rect.
   */
  onActivate: (id: string) => void
  onClose: () => void
  onSettled: () => void
  /** Accessible name for the back-face dialog. */
  label: string
  disabled?: boolean
  'aria-pressed'?: boolean
  front: ReactNode
  /** Lazy: the showcase renders only while this cell is mounted. */
  back: () => ReactNode
  /** Extra classes for the cell wrapper — the mesh borders live here. */
  className?: string
}

export function MeshFlipCell({
  id,
  open,
  mounted,
  onActivate,
  onClose,
  onSettled,
  label,
  disabled,
  'aria-pressed': ariaPressed,
  front,
  back,
  className,
}: MeshFlipCellProps) {
  const cellRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const wasMounted = useRef(false)

  const measure = useCallback(() => {
    const el = cellRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    // 1024px = the max-w-5xl the detail Modal used; 94vw keeps phones inside
    // the viewport with a sliver of veil visible around the card.
    const targetW = Math.min(vw * 0.94, 1024)
    el.style.setProperty('--dx', `${vw / 2 - (rect.left + rect.width / 2)}px`)
    el.style.setProperty('--dy', `${vh / 2 - (rect.top + rect.height / 2)}px`)
    el.style.setProperty('--s', `${targetW / rect.width}`)
    el.style.setProperty('--back-w', `${targetW}px`)
  }, [])

  const handleClick = () => {
    measure()
    onActivate(id)
  }

  // While open: focus the dialog, and track orientation/resize so the card
  // stays centered (the wrapper is never transformed, so its rect is honest).
  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => backRef.current?.focus())
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  // Return focus to the tile once its back face has gone — covers both the
  // animated settle and the reduced-motion instant close.
  useEffect(() => {
    if (mounted) {
      wasMounted.current = true
    } else if (wasMounted.current) {
      wasMounted.current = false
      btnRef.current?.focus()
    }
  }, [mounted])

  // transitionend can be swallowed (hidden tab, interrupted transition) and
  // then the veil would linger forever — a timer lands the close regardless.
  useEffect(() => {
    if (open || !mounted) return
    const timer = window.setTimeout(onSettled, SETTLE_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [open, mounted, onSettled])

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform' || e.target !== e.currentTarget) return
    if (!open) onSettled()
  }

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !backRef.current) return
    const focusable = Array.from(backRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      ref={cellRef}
      className={cn(
        'relative [perspective:1200px]',
        // Open cell rides above the veil (z-modal) for the whole flight, both
        // directions — z-fab is the next layer up. Idle cells only need to
        // cover their neighbours' hairlines while the hover scale plays.
        mounted ? 'z-fab' : 'hover:z-raised',
        className
      )}
    >
      <div
        className={cn('mesh-flip relative h-full', open && 'mesh-open', mounted && 'will-change-transform')}
        onTransitionEnd={handleTransitionEnd}
      >
        <button
          ref={btnRef}
          type="button"
          onClick={handleClick}
          disabled={disabled}
          aria-pressed={ariaPressed}
          aria-expanded={open}
          aria-haspopup="dialog"
          // Off the tab order while flipped away; some engines still hit-test
          // a rotated-away face, so clicks are cut too.
          tabIndex={mounted ? -1 : 0}
          className={cn(
            'mesh-face relative block h-full w-full text-left',
            'transition-transform motion-safe:hover:scale-[1.02]',
            // Inset ring: an outset one is swallowed by flush neighbours.
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ktip-ocean-500',
            'disabled:cursor-not-allowed disabled:opacity-60',
            mounted && 'pointer-events-none'
          )}
        >
          {front}
        </button>

        {mounted && (
          <div
            ref={backRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            // Clicking the card sends it home, same as the veil.
            onClick={onClose}
            onKeyDown={trapTab}
            // sm+ stays overflow-visible on purpose: the showcase artwork
            // deliberately breaks the panel's edges (the same rule the bare
            // Modal followed). Phones stack the card in-flow, so a scroll
            // container is safe there.
            className="mesh-back absolute left-1/2 top-1/2 w-[var(--back-w,64rem)] max-h-[92svh] overflow-y-auto focus:outline-none sm:max-h-none sm:overflow-visible"
          >
            {back()}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The blur veil between the mesh and the flying card. Stays mounted through
 * the close transition so the blur can fade while the card flies home.
 */
export function MeshVeil({
  shown,
  mounted,
  onClose,
}: {
  shown: boolean
  mounted: boolean
  onClose: () => void
}) {
  if (!mounted) return null
  return (
    <div
      // Same screenshot-capture contract as the Modal backdrop.
      data-capture-hide
      aria-hidden="true"
      onClick={onClose}
      className={cn(
        'fixed inset-0 z-modal bg-black/40 backdrop-blur-md transition-opacity duration-300',
        shown ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    />
  )
}
