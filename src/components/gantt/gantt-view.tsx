import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { format } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useGantt } from './gantt'
import { GanttBar, GanttGroupBar, type PositionedMarker } from './gantt-bar'
import { barRect, pxForDate } from './gantt-scale'
import {
  BAR_HEIGHT,
  GROUP_BAR_HEIGHT,
  GROUP_ROW_HEIGHT,
  HEADER_MAJOR_HEIGHT,
  HEADER_MINOR_HEIGHT,
  LANE_HEIGHT,
  MIN_GRID_WIDTH,
  ROW_PADDING_Y,
  type GanttEvent,
  type GanttRow,
  type GanttWindow,
} from './gantt-types'

/** Vertical offset of lane `index` inside a row of `height`. */
function laneTop(index: number, laneCount: number, height: number): number {
  if (laneCount <= 1) return (height - BAR_HEIGHT) / 2
  return ROW_PADDING_Y + index * LANE_HEIGHT + (LANE_HEIGHT - BAR_HEIGHT) / 2
}

function markersFor(event: GanttEvent, win: GanttWindow): PositionedMarker[] {
  if (!event.markers?.length) return []
  const positioned: PositionedMarker[] = []
  for (const marker of event.markers) {
    const left = pxForDate(marker.date, win)
    if (left < 0 || left > win.totalWidth) continue
    positioned.push({
      id: marker.id,
      label: `${marker.label} — ${format(marker.date, 'PP')}`,
      left,
      muted: marker.muted,
    })
  }
  return positioned
}

function GanttHeader({ cornerRef }: { cornerRef: RefObject<HTMLDivElement | null> }) {
  const { window: win } = useGantt()

  return (
    <div className="flex border-b border-ktip-sand-100 bg-ktip-cream">
      <div
        ref={cornerRef}
        className="sticky start-0 z-20 shrink-0 bg-ktip-cream border-e border-ktip-sand-100"
        style={{ width: 'var(--gantt-tree-w)', height: HEADER_MAJOR_HEIGHT + HEADER_MINOR_HEIGHT }}
      />
      <div className="relative shrink-0" style={{ width: 'var(--gantt-grid-w)' }}>
        <div className="relative" style={{ height: HEADER_MAJOR_HEIGHT }}>
          {win.major.map((tick) => (
            <div
              key={tick.key}
              className="absolute top-0 bottom-0 flex items-center px-2 border-s border-ktip-sand-200/60 first:border-s-0 text-xs font-medium uppercase tracking-wide text-ktip-sand-500 overflow-hidden whitespace-nowrap"
              style={{ left: tick.left, width: tick.width }}
            >
              {tick.label}
            </div>
          ))}
        </div>
        <div
          className="relative border-t border-ktip-sand-100"
          style={{ height: HEADER_MINOR_HEIGHT }}
        >
          {win.minor.map((tick) => (
            <div
              key={tick.key}
              className="absolute top-0 bottom-0 flex items-center justify-center border-s border-ktip-sand-200/40 first:border-s-0 text-[10px] text-ktip-sand-400 overflow-hidden whitespace-nowrap"
              style={{ left: tick.left, width: tick.width }}
            >
              {tick.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GanttGridOverlay({ todayLeft }: { todayLeft: number | null }) {
  const { window: win } = useGantt()

  return (
    <div
      aria-hidden="true"
      className="absolute inset-y-0 z-0 pointer-events-none"
      style={{ left: 'var(--gantt-tree-w)', width: 'var(--gantt-grid-w)' }}
    >
      {win.offDayBands.map((band) => (
        <div
          key={band.key}
          className="absolute inset-y-0 bg-ktip-sand-100/70"
          style={{ left: band.left, width: band.width }}
        />
      ))}
      {win.minor.map((tick, i) => (
        <div
          key={tick.key}
          className={cn('absolute inset-y-0 w-px bg-ktip-sand-200/50', i === 0 && 'hidden')}
          style={{ left: tick.left }}
        />
      ))}
      {win.major.map((tick, i) => (
        <div
          key={tick.key}
          className={cn('absolute inset-y-0 w-px bg-ktip-sand-200', i === 0 && 'hidden')}
          style={{ left: tick.left }}
        />
      ))}
      {todayLeft !== null && (
        <div className="absolute inset-y-0 w-px bg-ktip-ocean-400/60" style={{ left: todayLeft }}>
          <span className="absolute -top-0.5 start-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-ktip-ocean-500 text-white text-[10px] font-medium leading-none whitespace-nowrap">
            Today
          </span>
        </div>
      )}
    </div>
  )
}

function GroupRow({ row }: { row: GanttRow }) {
  const { window: win, toggleCollapse, renderResourceLabel } = useGantt()
  const rect = row.summary ? barRect(row.summary.start, row.summary.end, win) : null
  const custom = renderResourceLabel?.(row.resource, {
    depth: row.depth,
    isGroup: true,
    collapsed: row.collapsed,
    toggleCollapse: () => toggleCollapse(row.id),
    events: [],
    summary: row.summary,
    selected: false,
  })

  return (
    <div
      className="flex items-stretch border-b border-ktip-sand-100 last:border-b-0"
      style={{ height: row.height }}
    >
      <button
        type="button"
        aria-expanded={!row.collapsed}
        onClick={() => toggleCollapse(row.id)}
        className="sticky start-0 z-10 shrink-0 flex items-center gap-1.5 px-3 text-start bg-ktip-canvas border-e border-ktip-sand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400 focus-visible:ring-inset"
        style={{ width: 'var(--gantt-tree-w)' }}
      >
        <ChevronRight
          size={14}
          className={cn(
            'shrink-0 text-ktip-sand-400 transition-transform duration-200',
            !row.collapsed && 'rotate-90'
          )}
        />
        {custom ?? (
          <span className="text-xs font-semibold uppercase tracking-wide text-ktip-sand-600 truncate">
            {row.resource.title}
          </span>
        )}
      </button>

      <div className="relative shrink-0 bg-ktip-canvas/60" style={{ width: 'var(--gantt-grid-w)' }}>
        {row.summary && rect && (
          <GanttGroupBar
            summary={row.summary}
            rect={rect}
            top={(GROUP_ROW_HEIGHT - GROUP_BAR_HEIGHT) / 2 - 3}
            title={row.resource.title}
          />
        )}
      </div>
    </div>
  )
}

function LeafRow({ row }: { row: GanttRow }) {
  const { window: win, renderResourceLabel, selectedEventId, selectEvent, toggleCollapse } =
    useGantt()
  const events = row.lanes.flat()
  const isSelected = selectedEventId === row.id

  const custom = renderResourceLabel?.(row.resource, {
    depth: row.depth,
    isGroup: false,
    collapsed: false,
    toggleCollapse: () => toggleCollapse(row.id),
    events,
    summary: null,
    selected: isSelected,
  })

  const toggleSelection = () => {
    const event = events[0] ?? null
    selectEvent(isSelected ? null : event)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isSelected}
      aria-label={row.resource.title}
      onClick={toggleSelection}
      onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggleSelection()
        }
      }}
      className={cn(
        'flex items-stretch cursor-pointer transition-colors border-b border-ktip-sand-100 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400 focus-visible:ring-inset',
        isSelected ? 'bg-ktip-ocean-50/60' : 'hover:bg-ktip-sand-50/60'
      )}
      style={{ height: row.height }}
    >
      <div
        className={cn(
          'sticky start-0 z-10 shrink-0 px-3 flex flex-col justify-center gap-1 border-e border-ktip-sand-100',
          isSelected ? 'bg-ktip-ocean-50' : 'bg-ktip-cream'
        )}
        style={{ width: 'var(--gantt-tree-w)' }}
      >
        {custom ?? (
          <span className="text-sm font-medium text-ktip-sand-900 truncate">
            {row.resource.title}
          </span>
        )}
      </div>

      <div className="relative shrink-0" style={{ width: 'var(--gantt-grid-w)' }}>
        {row.lanes.map((lane, laneIndex) =>
          lane.map((event) => {
            const rect = barRect(event.start, event.end, win)
            if (!rect) return null
            return (
              <GanttBar
                key={event.id}
                event={event}
                rect={rect}
                top={laneTop(laneIndex, row.laneCount, row.height)}
                selected={selectedEventId === event.id}
                markers={markersFor(event, win)}
                onSelect={() => toggleSelection()}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

export function GanttView({ className }: { className?: string }) {
  const {
    rows,
    window: win,
    today,
    treeWidth,
    scrollRef,
    scrollTarget,
    clearScrollTarget,
    goPrev,
    goNext,
  } = useGantt()

  const cornerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const syncEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 })
  }, [scrollRef])

  useEffect(syncEdges, [syncEdges, win, rows])

  // Scroll requests (Today, api.goTo) centre the date once the new window is laid out.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !scrollTarget) return
    const offset = cornerRef.current?.offsetWidth ?? treeWidth
    const target = offset + pxForDate(scrollTarget, win) - el.clientWidth / 2
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth))
    clearScrollTarget()
    syncEdges()
  }, [scrollTarget, win, treeWidth, scrollRef, clearScrollTarget, syncEdges])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el) return
    const step = win.minor[0]?.width ?? 48
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      el.scrollLeft += step
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      el.scrollLeft -= step
    } else if (e.key === 'Home') {
      e.preventDefault()
      el.scrollLeft = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      el.scrollLeft = el.scrollWidth
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      goPrev()
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      goNext()
    }
  }

  const todayLeft =
    today >= win.start && today < win.end ? pxForDate(today, win) : null

  return (
    <div className={cn('relative', className)}>
      <div
        ref={scrollRef}
        role="region"
        aria-label="Timeline grid"
        tabIndex={0}
        onScroll={syncEdges}
        onKeyDown={onKeyDown}
        className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400 focus-visible:ring-inset"
      >
        <div
          // The tree column narrows on small screens; every px offset below is
          // expressed against these two vars so nothing has to be recomputed.
          className="[--gantt-tree-w:136px] sm:[--gantt-tree-w:var(--gantt-tree-set)]"
          style={
            {
              '--gantt-tree-set': `${treeWidth}px`,
              '--gantt-grid-w': `${win.totalWidth}px`,
              width: 'calc(var(--gantt-tree-w) + var(--gantt-grid-w))',
              minWidth: MIN_GRID_WIDTH,
            } as CSSProperties
          }
        >
          <GanttHeader cornerRef={cornerRef} />
          <div className="relative">
            <GanttGridOverlay todayLeft={todayLeft} />
            {rows.map((row) =>
              row.isGroup ? (
                <GroupRow key={row.id} row={row} />
              ) : (
                <LeafRow key={row.id} row={row} />
              )
            )}
          </div>
        </div>
      </div>

      {/* Scrollbars are hidden globally, so the only cue that there is more
          timeline off-screen is these fades (plus the Prev/Next controls). */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 start-0 w-8 bg-gradient-to-r from-ktip-cream to-transparent pointer-events-none transition-opacity',
          edges.start ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-ktip-cream to-transparent pointer-events-none transition-opacity',
          edges.end ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
}
