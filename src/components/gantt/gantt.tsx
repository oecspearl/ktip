import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { RefObject } from 'react'
import { cn } from '../../lib/utils'
import { buildRows } from './gantt-model'
import { buildWindow, dayOffset, initialAnchorFor, shiftAnchor, windowBoundsFor } from './gantt-scale'
import {
  DEFAULT_OFF_DAYS,
  DEFAULT_TREE_WIDTH,
  NARROW_TREE_WIDTH,
  SCALE_SPECS,
  type GanttApi,
  type GanttEvent,
  type GanttProps,
  type GanttResource,
  type GanttRow,
  type GanttScale,
  type GanttWindow,
  type RenderResourceLabel,
} from './gantt-types'

interface GanttContextValue {
  events: GanttEvent[]
  resources: GanttResource[]
  rows: GanttRow[]

  scale: GanttScale
  setScale: (scale: GanttScale) => void

  anchor: Date
  window: GanttWindow
  goPrev: () => void
  goNext: () => void
  goToday: () => void

  today: Date
  offDays: readonly number[]
  treeWidth: number

  collapsed: ReadonlySet<string>
  toggleCollapse: (id: string) => void

  selectedEventId: string | null
  selectEvent: (event: GanttEvent | null) => void

  renderResourceLabel?: RenderResourceLabel
  /** Stored for API parity; the gantt never invokes it. */
  onResourceReorder?: (resources: GanttResource[]) => void

  scrollRef: RefObject<HTMLDivElement | null>
  /** A date the grid should scroll into view, consumed once by GanttView. */
  scrollTarget: Date | null
  clearScrollTarget: () => void

  api: GanttApi
}

const GanttContext = createContext<GanttContextValue | null>(null)

export function useGantt(): GanttContextValue {
  const ctx = useContext(GanttContext)
  if (!ctx) throw new Error('useGantt must be used within <Gantt>')
  return ctx
}

/** Width of the scroll viewport, or 0 before it has been measured. */
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return width
}

/** Mirrors the `sm:` breakpoint that swaps the tree column width in GanttView. */
function useIsSmUp(): boolean {
  const [matches, setMatches] = useState(true)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(min-width: 640px)')
    setMatches(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return matches
}

export function Gantt({
  resources,
  defaultEvents,
  events,
  onEventsChange,
  defaultScale = 'month',
  scale,
  onScaleChange,
  defaultDate,
  date,
  onDateChange,
  apiRef,
  offDays = DEFAULT_OFF_DAYS,
  treePanel,
  renderResourceLabel,
  onResourceReorder,
  defaultCollapsed,
  selectedEventId,
  onSelectEvent,
  today: todayProp,
  className,
  children,
}: GanttProps) {
  const today = useMemo(() => todayProp ?? new Date(), [todayProp])

  // ── events: controlled by `events`, else seeded once from `defaultEvents` ──
  const [internalEvents, setInternalEvents] = useState<GanttEvent[]>(() => defaultEvents ?? [])
  const isEventsControlled = events !== undefined
  const resolvedEvents = isEventsControlled ? events : internalEvents

  // ── scale ──
  const [internalScale, setInternalScale] = useState<GanttScale>(defaultScale)
  const resolvedScale = scale ?? internalScale
  const setScale = useCallback(
    (next: GanttScale) => {
      if (scale === undefined) setInternalScale(next)
      onScaleChange?.(next)
    },
    [scale, onScaleChange]
  )

  // ── anchor date ──
  const [internalAnchor, setInternalAnchor] = useState<Date>(
    () => defaultDate ?? initialAnchorFor(defaultEvents ?? events ?? [], defaultScale, today)
  )
  const anchor = date ?? internalAnchor
  const setAnchor = useCallback(
    (next: Date) => {
      if (date === undefined) setInternalAnchor(next)
      onDateChange?.(next)
    },
    [date, onDateChange]
  )

  const [scrollTarget, setScrollTarget] = useState<Date | null>(today)
  const clearScrollTarget = useCallback(() => setScrollTarget(null), [])

  // Data usually arrives after mount (react-query). Re-anchor once, the first
  // time there is anything to look at, so a dormant member doesn't open on an
  // empty grid — but never after the user has navigated.
  const didAutoAnchor = useRef(resolvedEvents.length > 0 || defaultDate !== undefined)
  useEffect(() => {
    if (didAutoAnchor.current || resolvedEvents.length === 0) return
    didAutoAnchor.current = true
    setAnchor(initialAnchorFor(resolvedEvents, resolvedScale, today))
  }, [resolvedEvents, resolvedScale, today, setAnchor])

  const goPrev = useCallback(
    () => setAnchor(shiftAnchor(anchor, resolvedScale, 'prev')),
    [anchor, resolvedScale, setAnchor]
  )
  const goNext = useCallback(
    () => setAnchor(shiftAnchor(anchor, resolvedScale, 'next')),
    [anchor, resolvedScale, setAnchor]
  )
  const goToday = useCallback(() => {
    setAnchor(today)
    setScrollTarget(today)
  }, [setAnchor, today])

  // ── collapsed groups ──
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(defaultCollapsed ?? [])
  )
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── selection ──
  const [internalSelected, setInternalSelected] = useState<string | null>(null)
  const isSelectionControlled = selectedEventId !== undefined
  const resolvedSelected = isSelectionControlled ? selectedEventId : internalSelected
  const selectEvent = useCallback(
    (event: GanttEvent | null) => {
      if (!isSelectionControlled) setInternalSelected(event?.id ?? null)
      onSelectEvent?.(event)
    },
    [isSelectionControlled, onSelectEvent]
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const treeWidth = treePanel?.width ?? DEFAULT_TREE_WIDTH

  // A window narrower than the viewport would otherwise leave dead space to the
  // right of the last column — at month scale, 3 months × 8px/day is only 736px.
  // Stretch the day width to fill instead; never shrink below the scale's own
  // density, so wide windows keep scrolling as before.
  const viewportWidth = useElementWidth(scrollRef)
  const smUp = useIsSmUp()
  const gridViewport = Math.max(0, viewportWidth - (smUp ? treeWidth : NARROW_TREE_WIDTH))

  const window = useMemo(() => {
    const bounds = windowBoundsFor(anchor, resolvedScale)
    const days = dayOffset(bounds.end, bounds.start)
    const fitted = gridViewport > 0 && days > 0 ? gridViewport / days : 0
    const pxPerDay = Math.max(SCALE_SPECS[resolvedScale].pxPerDay, fitted)
    return buildWindow(anchor, resolvedScale, offDays, pxPerDay)
  }, [anchor, resolvedScale, offDays, gridViewport])
  const rows = useMemo(
    () => buildRows({ resources, events: resolvedEvents, collapsed, pxPerDay: window.pxPerDay }),
    [resources, resolvedEvents, collapsed, window.pxPerDay]
  )

  // ── imperative api ──
  // Events are read through a ref so the api object identity stays stable and
  // `apiRef.current` can never go stale between renders.
  const eventsRef = useRef(resolvedEvents)
  useEffect(() => {
    eventsRef.current = resolvedEvents
  }, [resolvedEvents])

  const controlledRef = useRef(isEventsControlled)
  controlledRef.current = isEventsControlled
  const onEventsChangeRef = useRef(onEventsChange)
  onEventsChangeRef.current = onEventsChange

  const api = useMemo<GanttApi>(
    () => ({
      addEvent: (event) => {
        const next = [...eventsRef.current, event]
        // In controlled mode the parent owns the array — mutating local state
        // would be silently thrown away by the next data refresh.
        if (!controlledRef.current) setInternalEvents(next)
        onEventsChangeRef.current?.(next)
      },
      getEvents: () => eventsRef.current,
      setScale,
      goTo: (next) => {
        setAnchor(next)
        setScrollTarget(next)
      },
      goToday,
    }),
    [setScale, setAnchor, goToday]
  )

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = api
    return () => {
      apiRef.current = null
    }
  }, [apiRef, api])

  const value = useMemo<GanttContextValue>(
    () => ({
      events: resolvedEvents,
      resources,
      rows,
      scale: resolvedScale,
      setScale,
      anchor,
      window,
      goPrev,
      goNext,
      goToday,
      today,
      offDays,
      treeWidth,
      collapsed,
      toggleCollapse,
      selectedEventId: resolvedSelected ?? null,
      selectEvent,
      renderResourceLabel,
      onResourceReorder,
      scrollRef,
      scrollTarget,
      clearScrollTarget,
      api,
    }),
    [
      resolvedEvents,
      resources,
      rows,
      resolvedScale,
      setScale,
      anchor,
      window,
      goPrev,
      goNext,
      goToday,
      today,
      offDays,
      treeWidth,
      collapsed,
      toggleCollapse,
      resolvedSelected,
      selectEvent,
      renderResourceLabel,
      onResourceReorder,
      scrollTarget,
      clearScrollTarget,
      api,
    ]
  )

  return (
    <GanttContext.Provider value={value}>
      <div
        role="group"
        aria-label="Timeline"
        className={cn(
          'flex flex-col bg-ktip-cream border border-ktip-sand-100 rounded-2xl shadow-card overflow-hidden',
          className
        )}
      >
        {children}
      </div>
    </GanttContext.Provider>
  )
}
