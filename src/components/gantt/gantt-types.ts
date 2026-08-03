import type { ReactNode, RefObject } from 'react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { Copy } from '../../i18n/copy'

/**
 * Shared vocabulary for the gantt. Kept free of React rendering so the scale
 * and layout math can be unit-tested without a DOM.
 */

export type GanttScale = 'week' | 'month' | 'quarter'
export type GanttDirection = 'prev' | 'next'

/** A marker pinned to a single date on a bar (a stage that was reached, a deadline). */
export interface GanttEventMarker {
  id: string
  date: Date
  /** `Copy`: stage names arrive as msg descriptors, resolved where drawn. */
  label: Copy
  /** Renders hollow rather than filled — for dates that are expected, not reached. */
  muted?: boolean
}

export interface GanttEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay?: boolean
  /** Any CSS color. Prefer `var(--color-…)` so dark mode re-themes without a re-render. */
  color?: string
  resourceId: string
  /** 0..1 */
  progress?: number
  /** No known end — `end` is "as of now", so the bar fades out instead of capping. */
  openEnded?: boolean
  markers?: GanttEventMarker[]
}

export interface GanttResource {
  id: string
  title: string
  children?: GanttResource[]
}

export interface GanttApi {
  addEvent(event: GanttEvent): void
  getEvents(): GanttEvent[]
  setScale(scale: GanttScale): void
  goTo(date: Date): void
  goToday(): void
}

export interface GanttTreePanelOptions {
  width?: number
}

export interface GanttSummary {
  start: Date
  end: Date
  count: number
  /** Duration-weighted mean of the descendants' progress. */
  progress: number
}

export interface GanttResourceLabelContext {
  depth: number
  isGroup: boolean
  collapsed: boolean
  toggleCollapse: () => void
  /** Events on this row. Empty for group rows. */
  events: GanttEvent[]
  /** Roll-up of every descendant event. Non-null only for group rows. */
  summary: GanttSummary | null
  selected: boolean
}

export type RenderResourceLabel = (
  resource: GanttResource,
  ctx: GanttResourceLabelContext
) => ReactNode

export interface ScaleSpec {
  pxPerDay: number
  minorUnit: 'day' | 'week' | 'month'
  majorUnit: 'week' | 'month' | 'quarter'
  windowUnit: 'week' | 'month' | 'quarter'
  windowCount: number
  minorFormat: string
  majorFormat: string
  /** Weekend shading only pays off when a day is wide enough to read. */
  shadeOffDays: boolean
}

export const SCALE_SPECS: Record<GanttScale, ScaleSpec> = {
  week: {
    pxPerDay: 48,
    minorUnit: 'day',
    majorUnit: 'week',
    windowUnit: 'week',
    windowCount: 4,
    minorFormat: 'EEEEE d',
    majorFormat: "'Week of' MMM d",
    shadeOffDays: true,
  },
  month: {
    pxPerDay: 8,
    minorUnit: 'week',
    majorUnit: 'month',
    windowUnit: 'month',
    windowCount: 3,
    minorFormat: 'd',
    majorFormat: 'MMM yyyy',
    shadeOffDays: false,
  },
  quarter: {
    pxPerDay: 3,
    minorUnit: 'month',
    majorUnit: 'quarter',
    windowUnit: 'quarter',
    windowCount: 4,
    minorFormat: 'MMM',
    majorFormat: 'QQQ yyyy',
    shadeOffDays: false,
  },
}

export const SCALE_ORDER: readonly GanttScale[] = ['week', 'month', 'quarter']

export const SCALE_LABELS: Record<GanttScale, MessageDescriptor> = {
  week: msg`Week`,
  month: msg`Month`,
  quarter: msg`Quarter`,
}

/** Sunday + Saturday. */
export const DEFAULT_OFF_DAYS: readonly number[] = [0, 6]

export const DEFAULT_TREE_WIDTH = 224
export const NARROW_TREE_WIDTH = 136
export const HEADER_MAJOR_HEIGHT = 28
export const HEADER_MINOR_HEIGHT = 24
export const LANE_HEIGHT = 20
export const BAR_HEIGHT = 12
export const GROUP_BAR_HEIGHT = 8
export const ROW_PADDING_Y = 12
export const MIN_ROW_HEIGHT = 56
export const GROUP_ROW_HEIGHT = 40
export const MIN_BAR_PX = 8
export const LANE_GAP_PX = 4
export const MIN_GRID_WIDTH = 560

export interface GanttTick {
  key: string
  start: Date
  end: Date
  left: number
  width: number
  label: string
}

export interface GanttOffDayBand {
  key: string
  left: number
  width: number
}

export interface GanttWindow {
  /** Inclusive. */
  start: Date
  /** Exclusive. */
  end: Date
  pxPerDay: number
  totalWidth: number
  minor: GanttTick[]
  major: GanttTick[]
  offDayBands: GanttOffDayBand[]
}

export interface BarRect {
  left: number
  width: number
  /** The bar begins before the window — cap the left edge square. */
  clippedStart: boolean
  clippedEnd: boolean
}

export interface GanttRow {
  id: string
  resource: GanttResource
  depth: number
  isGroup: boolean
  parentId: string | null
  collapsed: boolean
  hasChildren: boolean
  /** Overlapping events split across lanes; row height follows lane count. */
  lanes: GanttEvent[][]
  laneCount: number
  height: number
  summary: GanttSummary | null
}

export interface GanttProps {
  resources: GanttResource[]
  /** Uncontrolled seed. Ignored when `events` is supplied. */
  defaultEvents?: GanttEvent[]
  /** Controlled events. */
  events?: GanttEvent[]
  onEventsChange?: (events: GanttEvent[]) => void

  defaultScale?: GanttScale
  scale?: GanttScale
  onScaleChange?: (scale: GanttScale) => void

  defaultDate?: Date
  date?: Date
  onDateChange?: (date: Date) => void

  apiRef?: RefObject<GanttApi | null>
  offDays?: readonly number[]
  treePanel?: GanttTreePanelOptions
  renderResourceLabel?: RenderResourceLabel
  /** Accepted for API parity. Reordering is not wired up — the gantt is read-only. */
  onResourceReorder?: (resources: GanttResource[]) => void
  defaultCollapsed?: string[]

  selectedEventId?: string | null
  onSelectEvent?: (event: GanttEvent | null) => void

  /** Test seam. Defaults to `new Date()`. */
  today?: Date
  className?: string
  children?: ReactNode
}
