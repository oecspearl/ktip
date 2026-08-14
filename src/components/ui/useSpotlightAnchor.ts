import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** A rect in viewport coordinates. Plain object, not a DOMRect: it is compared
 *  every frame and stored in state. */
export interface AnchorBox {
  top: number
  left: number
  width: number
  height: number
}

export type AnchorSide = 'top' | 'bottom' | 'left' | 'right'
export type AnchorPlacement = AnchorSide | 'center'

export interface SpotlightAnchorOptions {
  /** CSS selector for the element to follow */
  target: string
  /** A second element spotlit alongside the first — a section plus its toolbar */
  secondaryTarget?: string
  /** False parks the loop: no rAF, no measuring, boxes stay null */
  active?: boolean
  /** Bring the target into view once, when it changes. Omit to leave scroll alone. */
  scrollMode?: 'top' | 'center' | 'none'
  /** Called when the target is still missing after `strandedMs`. Use it to skip
   *  the step rather than leaving someone staring at a scrim over nothing. */
  onStranded?: () => void
  strandedMs?: number
}

export interface SpotlightAnchor {
  /** Live rect of the target, or null while it is missing */
  box: AnchorBox | null
  secondaryBox: AnchorBox | null
  /** The resolved node, for dispatching a synthetic click at it */
  element: HTMLElement | null
  /** Both boxes, nulls dropped — what the scrim cuts out */
  boxes: AnchorBox[]
}

/** Comfort margin when scrolling a target into view */
const COMFORT = 96
const STRANDED_MS = 1500

const boxOf = (el: Element): AnchorBox => {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

const sameBox = (a: AnchorBox | null, b: AnchorBox | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5)

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * First match with a non-zero rect. Plain `querySelector` is not enough: a page
 * can mount one anchor per card and swap which view is on screen — a 0×0 twin
 * would pin the spotlight at the viewport origin.
 */
export function findVisible(selector: string): HTMLElement | null {
  let nodes: NodeListOf<HTMLElement>
  try {
    nodes = document.querySelectorAll<HTMLElement>(selector)
  } catch {
    return null
  }
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return node
  }
  return null
}

/** Nearest ancestor that actually scrolls (a side panel, not the window) */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 1) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/** Scrolls both the element's own scroll container and the page */
export function scrollAnchorIntoView(el: HTMLElement, mode: 'top' | 'center') {
  const container = scrollParentOf(el)
  if (container) {
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    const offset = eRect.top - cRect.top + container.scrollTop
    const next =
      mode === 'top'
        ? offset - 16
        : offset - Math.max(0, (container.clientHeight - eRect.height) / 2)
    container.scrollTo({ top: Math.max(0, next), behavior: 'smooth' })
  }

  const anchor = container ?? el
  // A fixed element (the FAB) is already in view by definition — scrolling
  // toward its "document position" just yanks the page for no reason.
  if (getComputedStyle(anchor).position === 'fixed') return
  const rect = anchor.getBoundingClientRect()
  if (rect.height > window.innerHeight) return
  const docTop = rect.top + window.scrollY
  const next =
    mode === 'top'
      ? docTop - COMFORT
      : docTop - Math.max(COMFORT, (window.innerHeight - rect.height) / 2)
  window.scrollTo({ top: Math.max(0, next), behavior: 'smooth' })
}

export interface PlacementOptions {
  /** Distance between the target and the card */
  gap?: number
  /** Keep-off-the-edge margin for the card */
  margin?: number
  /** Preferred side; ignored when it does not fit */
  preferred?: AnchorPlacement
}

/**
 * Where to put a card of `cardW × cardH` relative to `target`.
 *
 * Tries the preferred side, then right/bottom/left/top, and when nothing fits
 * beside the target — typical when the anchor is a whole section — pins the
 * card flush to the roomiest viewport edge instead of centring it on the
 * target, so the least content is covered.
 */
export function computeAnchorPlacement(
  target: AnchorBox | null,
  cardW: number,
  cardH: number,
  { gap = 24, margin = 20, preferred }: PlacementOptions = {}
): { top: number; left: number; side: AnchorPlacement } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (!target || preferred === 'center') {
    return {
      top: Math.max(margin, (vh - cardH) / 2),
      left: Math.max(margin, (vw - cardW) / 2),
      side: 'center',
    }
  }

  const space: Record<AnchorSide, number> = {
    right: vw - (target.left + target.width) - gap,
    left: target.left - gap,
    bottom: vh - (target.top + target.height) - gap,
    top: target.top - gap,
  }
  const fits: Record<AnchorSide, boolean> = {
    right: space.right >= cardW + margin,
    left: space.left >= cardW + margin,
    bottom: space.bottom >= cardH + margin,
    top: space.top >= cardH + margin,
  }

  const order: AnchorSide[] = ['right', 'bottom', 'left', 'top']
  const wanted = preferred
  const fittedSide = wanted && fits[wanted] ? wanted : order.find((s) => fits[s])
  const side = fittedSide ?? (Object.keys(space) as AnchorSide[]).sort((a, b) => space[b] - space[a])[0]

  let top: number
  let left: number
  if (!fittedSide) {
    switch (side) {
      case 'right':
        left = vw - cardW - margin
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'left':
        left = margin
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'bottom':
        top = vh - cardH - margin
        left = target.left + target.width / 2 - cardW / 2
        break
      default:
        top = margin
        left = target.left + target.width / 2 - cardW / 2
        break
    }
  } else {
    switch (side) {
      case 'right':
        left = target.left + target.width + gap
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'left':
        left = target.left - gap - cardW
        top = target.top + target.height / 2 - cardH / 2
        break
      case 'bottom':
        top = target.top + target.height + gap
        left = target.left + target.width / 2 - cardW / 2
        break
      default:
        top = target.top - gap - cardH
        left = target.left + target.width / 2 - cardW / 2
        break
    }
  }

  return {
    top: clamp(top, margin, vh - cardH - margin),
    left: clamp(left, margin, vw - cardW - margin),
    side,
  }
}

/**
 * Follow a DOM element by selector, for anything drawn over it.
 *
 * A rAF loop rather than a pile of scroll/resize/mutation listeners: the page
 * scrolls at document level, panels scroll internally, cards animate in, and
 * views slide. One loop tracks all of it, and state only updates when the rect
 * has actually moved, so a still page re-renders nothing.
 */
export function useSpotlightAnchor({
  target,
  secondaryTarget,
  active = true,
  scrollMode = 'center',
  onStranded,
  strandedMs = STRANDED_MS,
}: SpotlightAnchorOptions): SpotlightAnchor {
  const [box, setBox] = useState<AnchorBox | null>(null)
  const [secondaryBox, setSecondaryBox] = useState<AnchorBox | null>(null)
  const elRef = useRef<HTMLElement | null>(null)

  // Latest callback without restarting the stranded timer on every render
  const strandedRef = useRef(onStranded)
  useEffect(() => {
    strandedRef.current = onStranded
  })

  useEffect(() => {
    if (!active) {
      elRef.current = null
      setBox(null)
      setSecondaryBox(null)
      return
    }
    let raf = 0

    const resolve = (selector: string, cached: HTMLElement | null): HTMLElement | null => {
      if (cached && cached.isConnected) {
        const r = cached.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return cached
      }
      return findVisible(selector)
    }

    const tick = () => {
      const el = resolve(target, elRef.current)
      if (el !== elRef.current) elRef.current = el
      const next = el ? boxOf(el) : null
      setBox((prev) => (sameBox(prev, next) ? prev : next))

      if (secondaryTarget) {
        const secondary = findVisible(secondaryTarget)
        const nextSecondary = secondary ? boxOf(secondary) : null
        setSecondaryBox((prev) => (sameBox(prev, nextSecondary) ? prev : nextSecondary))
      } else {
        setSecondaryBox(null)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, secondaryTarget, active])

  // Scroll into view once per target, with one retry: the node may only mount
  // a frame or two later (view swaps, entrance animations).
  useEffect(() => {
    if (!active || scrollMode === 'none') return
    let cancelled = false
    const attempt = () => {
      if (cancelled) return
      const el = findVisible(target)
      if (el) scrollAnchorIntoView(el, scrollMode)
    }
    attempt()
    const retry = window.setTimeout(attempt, 350)
    return () => {
      cancelled = true
      window.clearTimeout(retry)
    }
  }, [target, active, scrollMode])

  // Safety net: never leave someone on a scrim over nothing
  useEffect(() => {
    if (!active || !strandedRef.current) return
    const timer = window.setTimeout(() => {
      if (!findVisible(target)) strandedRef.current?.()
    }, strandedMs)
    return () => window.clearTimeout(timer)
  }, [target, active, strandedMs])

  const boxes = [box, secondaryBox].filter((b): b is AnchorBox => b !== null)

  return { box, secondaryBox, element: elRef.current, boxes }
}

/**
 * The card's own size, remeasured as its content or the viewport changes.
 * Placement needs it, and a card whose height changes between steps would
 * otherwise be placed against the previous step's height.
 */
export function useMeasuredSize(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
  initial = { width: 360, height: 240 }
) {
  const [size, setSize] = useState(initial)

  // Layout effect: the card is placed from this size, so measuring after paint
  // would show one frame of the card at the previous step's position.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((prev) =>
        Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { width: r.width, height: r.height }
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return size
}