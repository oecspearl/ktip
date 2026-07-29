import { dayOffset } from './gantt-scale'
import {
  GROUP_ROW_HEIGHT,
  LANE_GAP_PX,
  LANE_HEIGHT,
  MIN_ROW_HEIGHT,
  ROW_PADDING_Y,
  type GanttEvent,
  type GanttResource,
  type GanttRow,
  type GanttSummary,
} from './gantt-types'

const MS_PER_DAY = 86_400_000

export function groupEventsByResource(events: GanttEvent[]): Map<string, GanttEvent[]> {
  const byResource = new Map<string, GanttEvent[]>()
  for (const event of events) {
    const bucket = byResource.get(event.resourceId)
    if (bucket) bucket.push(event)
    else byResource.set(event.resourceId, [event])
  }
  return byResource
}

/**
 * Greedy interval partitioning — minimal lanes for a set of intervals.
 *
 * The separation is expressed in pixels and converted to time via `pxPerDay`:
 * two bars a day apart never overlap in time, but at quarter scale that day is
 * 3px and they collide on screen. So lane count — and therefore row height — is
 * scale-dependent by design.
 */
export function assignLanes(
  events: GanttEvent[],
  pxPerDay: number,
  minGapPx: number = LANE_GAP_PX
): GanttEvent[][] {
  if (events.length === 0) return []

  const gapMs = (minGapPx / pxPerDay) * MS_PER_DAY
  // Sorted by start, then end, then id — the id tiebreak keeps lane assignment
  // stable across renders when two events share both timestamps.
  const sorted = [...events].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      a.end.getTime() - b.end.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )

  const lanes: GanttEvent[][] = []
  const laneEnd: number[] = []

  for (const event of sorted) {
    let index = laneEnd.findIndex((end) => end + gapMs <= event.start.getTime())
    if (index === -1) {
      index = lanes.length
      lanes.push([])
      laneEnd.push(Number.NEGATIVE_INFINITY)
    }
    lanes[index].push(event)
    laneEnd[index] = Math.max(laneEnd[index], event.end.getTime())
  }

  return lanes
}

/**
 * Roll-up envelope for a group row. Progress is weighted by duration: a
 * six-month project at 50% next to a two-day draft at 0% should read ~49%,
 * not the 25% a plain mean would give.
 */
export function summarizeEvents(events: GanttEvent[]): GanttSummary | null {
  if (events.length === 0) return null

  let start = events[0].start
  let end = events[0].end
  let weighted = 0
  let totalDays = 0

  for (const event of events) {
    if (event.start < start) start = event.start
    if (event.end > end) end = event.end
    // Floor at one day so same-day items still carry weight.
    const days = Math.max(1, dayOffset(event.end, event.start))
    weighted += (event.progress ?? 0) * days
    totalDays += days
  }

  const progress =
    totalDays > 0
      ? weighted / totalDays
      : events.reduce((sum, e) => sum + (e.progress ?? 0), 0) / events.length

  return { start, end, count: events.length, progress }
}

/** Every event on this resource and its whole subtree. */
export function collectDescendantEvents(
  resource: GanttResource,
  byResource: Map<string, GanttEvent[]>
): GanttEvent[] {
  const own = byResource.get(resource.id) ?? []
  if (!resource.children?.length) return own
  return resource.children.reduce<GanttEvent[]>(
    (acc, child) => acc.concat(collectDescendantEvents(child, byResource)),
    [...own]
  )
}

/**
 * Flattens the resource tree into rendered rows, skipping the children of
 * collapsed groups. Lanes are resolved here (not in the bar renderer) because
 * row height depends on lane count and the label cell has to match it.
 */
export function buildRows(args: {
  resources: GanttResource[]
  events: GanttEvent[]
  collapsed: ReadonlySet<string>
  pxPerDay: number
}): GanttRow[] {
  const { resources, events, collapsed, pxPerDay } = args
  const byResource = groupEventsByResource(events)
  const rows: GanttRow[] = []

  const walk = (resource: GanttResource, depth: number, parentId: string | null) => {
    const hasChildren = !!resource.children?.length
    const isCollapsed = collapsed.has(resource.id)
    const lanes = hasChildren ? [] : assignLanes(byResource.get(resource.id) ?? [], pxPerDay)
    const laneCount = lanes.length

    rows.push({
      id: resource.id,
      resource,
      depth,
      isGroup: hasChildren,
      parentId,
      collapsed: isCollapsed,
      hasChildren,
      lanes,
      laneCount,
      height: hasChildren
        ? GROUP_ROW_HEIGHT
        : Math.max(MIN_ROW_HEIGHT, ROW_PADDING_Y * 2 + Math.max(1, laneCount) * LANE_HEIGHT),
      summary: hasChildren ? summarizeEvents(collectDescendantEvents(resource, byResource)) : null,
    })

    if (hasChildren && !isCollapsed) {
      for (const child of resource.children!) walk(child, depth + 1, resource.id)
    }
  }

  for (const resource of resources) walk(resource, 0, null)
  return rows
}
