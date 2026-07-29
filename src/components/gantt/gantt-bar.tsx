import { format } from 'date-fns'
import { cn } from '../../lib/utils'
import {
  BAR_HEIGHT,
  GROUP_BAR_HEIGHT,
  type BarRect,
  type GanttEvent,
  type GanttSummary,
} from './gantt-types'

/** A marker already resolved to a pixel offset within the lane. */
export interface PositionedMarker {
  id: string
  label: string
  left: number
  muted?: boolean
}

interface GanttBarProps {
  event: GanttEvent
  rect: BarRect
  top: number
  selected: boolean
  markers: PositionedMarker[]
  onSelect: (event: GanttEvent) => void
}

function describe(event: GanttEvent): string {
  const start = format(event.start, 'PP')
  const end = event.openEnded ? 'ongoing' : format(event.end, 'PP')
  const pct = Math.round((event.progress ?? 0) * 100)
  return `${event.title}, ${start} to ${end}, ${pct}% complete`
}

export function GanttBar({ event, rect, top, selected, markers, onSelect }: GanttBarProps) {
  const color = event.color ?? 'var(--color-ktip-ocean-500)'
  const progress = Math.min(1, Math.max(0, event.progress ?? 0))
  const label = describe(event)

  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(event)
        }}
        className="absolute cursor-pointer"
        style={{ left: rect.left, width: rect.width, top, height: BAR_HEIGHT }}
      >
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={event.title}
          className={cn(
            'relative w-full h-full overflow-hidden rounded-full transition-shadow',
            rect.clippedStart && 'rounded-s-none',
            rect.clippedEnd && 'rounded-e-none',
            selected && 'ring-2 ring-ktip-ocean-400 ring-offset-1 ring-offset-ktip-cream',
            // No known end: dissolve the tail instead of implying a hard stop.
            event.openEnded &&
              '[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]'
          )}
        >
          {/* Track and fill are siblings — dimming the parent would dim both. */}
          <span
            className="absolute inset-0"
            style={{ backgroundColor: color, opacity: 0.22 }}
            aria-hidden="true"
          />
          <span
            className="absolute inset-y-0 start-0 transition-[width] duration-300"
            style={{ backgroundColor: color, width: `${progress * 100}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {markers.map((marker) => (
        <span
          key={marker.id}
          title={marker.label}
          aria-hidden="true"
          className={cn(
            'absolute w-2 h-2 rounded-full -translate-x-1/2 ring-2 ring-ktip-cream pointer-events-none',
            marker.muted ? 'bg-ktip-sand-300' : 'bg-ktip-sand-700'
          )}
          style={{ left: marker.left, top: top + (BAR_HEIGHT - 8) / 2 }}
        />
      ))}
    </>
  )
}

interface GanttGroupBarProps {
  summary: GanttSummary
  rect: BarRect
  top: number
  title: string
}

/** Neutral roll-up envelope with end brackets — never competes with its children. */
export function GanttGroupBar({ summary, rect, top, title }: GanttGroupBarProps) {
  const progress = Math.min(1, Math.max(0, summary.progress))
  const label = `${title}: ${summary.count} item${summary.count === 1 ? '' : 's'}, ${format(
    summary.start,
    'PP'
  )} to ${format(summary.end, 'PP')}, ${Math.round(progress * 100)}% complete`

  return (
    <div
      title={label}
      aria-label={label}
      className="absolute"
      style={{ left: rect.left, width: rect.width, top, height: GROUP_BAR_HEIGHT }}
    >
      <div className="relative w-full h-full overflow-hidden rounded-xs bg-ktip-sand-200">
        <span
          className="absolute inset-y-0 start-0 bg-ktip-sand-500"
          style={{ width: `${progress * 100}%` }}
          aria-hidden="true"
        />
      </div>
      {!rect.clippedStart && (
        <span
          aria-hidden="true"
          className="absolute start-0 top-full w-px h-1.5 bg-ktip-sand-400"
        />
      )}
      {!rect.clippedEnd && (
        <span aria-hidden="true" className="absolute end-0 top-full w-px h-1.5 bg-ktip-sand-400" />
      )}
    </div>
  )
}
