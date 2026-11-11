import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate, type LinkProps, type NavigateOptions, type To } from 'react-router'
import { useReducedMotion } from '../../hooks/useReducedMotion'

/**
 * A page change behind an iris: the screen closes to a point, the route swaps
 * while it is shut, and it opens again on the new page. The welcome panel's
 * exit, reusable (see .iris-cutout in index.css for how the ring is drawn).
 *
 * The provider sits above the routes it moves between, so the ring that closed
 * on one page is the same element that opens on the next.
 *
 * A page that is still loading can hold the iris shut (useIrisHold), so the
 * hole opens on the page and not on its skeleton. While it waits, the KTIP
 * logo pulses on the closed screen; when the page is ready the logo fades and
 * the hole opens.
 */

/** Matches the CSS animations, plus a frame of slack. */
const CLOSE_MS = 380
/** The logo's fade (140ms) and then the hole (460ms): see .iris-cutout in index.css. */
const OPEN_MS = 600
/**
 * However the work in between goes, the screen opens again after this. A
 * stalled request must never leave someone staring at a blank ground.
 */
const WATCHDOG_MS = 4000

type Phase = 'idle' | 'closing' | 'closed' | 'opening'

export interface IrisOrigin {
  x: number
  y: number
}

interface IrisApi {
  /** Shut the iris on a point (the viewport centre by default). Resolves once it is closed. */
  close: (origin?: IrisOrigin | null) => Promise<void>
  /** Open it again. Safe to call when it never closed. Waits for any page holding it shut. */
  open: () => void
  /**
   * Keep the iris shut until the returned function is called. A page that is
   * still loading holds it; the watchdog opens it regardless.
   */
  hold: () => () => void
  /** close, navigate, open: the whole move in one call. */
  navigate: (to: To, options?: NavigateOptions & { origin?: IrisOrigin | null }) => Promise<void>
}

const IrisContext = createContext<IrisApi | null>(null)

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** Diameter that clears the farthest corner of the viewport from `o`. */
function coverDiameter(o: IrisOrigin): number {
  const w = window.innerWidth
  const h = window.innerHeight
  return Math.ceil(2 * Math.hypot(Math.max(o.x, w - o.x), Math.max(o.y, h - o.y))) + 4
}

export function IrisTransitionProvider({ children }: { children: ReactNode }) {
  const routerNavigate = useNavigate()
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('idle')
  const [origin, setOrigin] = useState<IrisOrigin>({ x: 0, y: 0 })
  const phaseRef = useRef<Phase>('idle')
  const timers = useRef<number[]>([])
  const reducedRef = useRef(reduced)
  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])

  const set = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  // Pages still loading behind the closed iris, and whether an open is owed
  // to them once the last one lets go.
  const holds = useRef(new Set<symbol>())
  const openOwed = useRef(false)

  const openNow = useCallback(() => {
    if (phaseRef.current === 'idle' || phaseRef.current === 'opening') return
    openOwed.current = false
    clearTimers()
    set('opening')
    later(() => set('idle'), OPEN_MS)
  }, [clearTimers, later, set])

  const open = useCallback(() => {
    if (phaseRef.current === 'idle' || phaseRef.current === 'opening') return
    // Two frames: the first lets the new route commit, the second lets it
    // paint, so the hole opens on the page and not on the old one's last frame.
    // By then a page that is still loading has said so.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (holds.current.size > 0) {
          openOwed.current = true
          return
        }
        openNow()
      })
    )
  }, [openNow])

  const hold = useCallback(() => {
    const id = Symbol('iris-hold')
    holds.current.add(id)
    return () => {
      if (!holds.current.delete(id)) return
      if (holds.current.size === 0 && openOwed.current) open()
    }
  }, [open])

  const close = useCallback(
    async (at?: IrisOrigin | null) => {
      // Reduced motion: no ring at all, the route simply changes.
      if (reducedRef.current || typeof window === 'undefined') return
      // Already shut, or on the way: share it rather than starting over.
      if (phaseRef.current === 'closed') return
      if (phaseRef.current === 'closing') return wait(CLOSE_MS)
      clearTimers()
      setOrigin(at ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 })
      set('closing')
      later(() => set('closed'), CLOSE_MS)
      // The watchdog does not wait for anybody.
      later(() => openNow(), WATCHDOG_MS)
      await wait(CLOSE_MS)
    },
    [clearTimers, later, openNow, set]
  )

  const navigate = useCallback<IrisApi['navigate']>(
    async (to, options) => {
      const { origin: at, ...navOptions } = options ?? {}
      try {
        await close(at)
        await routerNavigate(to, navOptions)
      } finally {
        open()
      }
    },
    [close, open, routerNavigate]
  )

  const api = useMemo<IrisApi>(() => ({ close, open, hold, navigate }), [close, open, hold, navigate])

  const diameter = phase === 'idle' ? 0 : coverDiameter(origin)

  return (
    <IrisContext.Provider value={api}>
      {children}
      {phase !== 'idle' && (
        <div
          className="iris-cutout"
          data-phase={phase}
          aria-hidden="true"
          style={
            {
              '--iris-x': `${origin.x}px`,
              '--iris-y': `${origin.y}px`,
              '--iris-d': `${diameter}px`,
            } as CSSProperties
          }
        >
          <div className="iris-cutout-hole" />
          {/* Only seen when the page behind takes a moment: it fades in after a
              beat, pulses while the page loads, and fades before the hole opens. */}
          <img src="/ktip-logo-128.webp" alt="" className="iris-cutout-logo" />
        </div>
      )}
    </IrisContext.Provider>
  )
}

/**
 * The iris, or a stand-in that does no animation when there is no provider
 * above, so a component can use it without caring where it is mounted.
 */
export function useIrisTransition(): IrisApi {
  const ctx = useContext(IrisContext)
  const routerNavigate = useNavigate()
  return useMemo<IrisApi>(
    () =>
      ctx ?? {
        close: async () => {},
        open: () => {},
        hold: () => () => {},
        navigate: async (to, options) => {
          const { origin: _origin, ...navOptions } = options ?? {}
          await routerNavigate(to, navOptions)
        },
      },
    [ctx, routerNavigate]
  )
}

/**
 * Keep the iris shut while `pending` is true: a page calls this with its own
 * loading state, so the hole opens on the page, not its skeleton. Does nothing
 * when the iris is not closed, and the watchdog still opens it after 4 seconds.
 */
export function useIrisHold(pending: boolean) {
  const ctx = useContext(IrisContext)
  const hold = ctx?.hold
  // Layout effect: registered at commit, before the frame in which open() looks.
  useLayoutEffect(() => {
    if (!pending || !hold) return
    return hold()
  }, [pending, hold])
}

/**
 * For a plain link: true when the click should go through the iris, false
 * when the browser should have it (a new tab, a download, a modified click).
 */
export function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
}

/**
 * A Link that goes through the iris on a plain click. A new tab, a modified
 * click or a middle click is left to the browser, as a link should be.
 */
export function IrisLink({ to, onClick, replace, state, target, ...rest }: LinkProps) {
  const iris = useIrisTransition()
  return (
    <Link
      to={to}
      replace={replace}
      state={state}
      target={target}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!isPlainLeftClick(e) || (target && target !== '_self')) return
        e.preventDefault()
        void iris.navigate(to, { replace, state })
      }}
    />
  )
}
