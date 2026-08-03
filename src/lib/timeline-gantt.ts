import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { GanttEvent, GanttResource } from '../components/gantt/gantt-types'
import type { TimelineItem } from './timeline'

/**
 * Bridges the domain timeline (grant applications + projects, whose durations
 * are derived from status/phase history) onto the generic gantt shapes.
 *
 * Child resource ids are the `TimelineItem.id` verbatim, so a selection made in
 * the gantt maps straight back onto the item list with no translation.
 */

export const GROUP_ID = {
  grant_application: 'group:grant_application',
  project: 'group:project',
} as const

const GROUP_TITLE: Record<TimelineItem['kind'], MessageDescriptor> = {
  grant_application: msg`Grant Applications`,
  project: msg`Projects`,
}

export interface TimelineGanttModel {
  resources: GanttResource[]
  events: GanttEvent[]
  itemsById: Map<string, TimelineItem>
}

export interface TimelineGanttOptions {
  /** Open-ended bars run to here. Defaults to `new Date()`. */
  now?: Date
  /** Keep a swimlane with no items. Off by default — a grants-only member
   *  shouldn't stare at an empty "Projects" lane. */
  includeEmptyGroups?: boolean
  /** Pin each reached stage on the bar. */
  withStageMarkers?: boolean
}

/**
 * Nothing stores a percentage, so progress is the position in the stage list.
 * Terminal items — including rejected ones — are done at 100%; the colour is
 * what carries the outcome.
 */
export function deriveProgress(item: TimelineItem): number {
  if (item.isTerminal) return 1
  const denominator = Math.max(1, item.stages.length - 1)
  return Math.min(1, Math.max(0, item.currentIndex / denominator))
}

/**
 * CSS variables rather than hex, so `html.dark` re-themes every bar without a
 * re-render. Projects use tropical-600 because the brand green at 500 is a
 * 1.8:1 read on cream.
 */
export function barColorFor(item: TimelineItem): string {
  if (item.isRejected) return 'var(--color-red-500)'
  if (item.kind === 'grant_application') {
    return item.currentKey === 'draft'
      ? 'var(--color-ktip-sand-400)'
      : 'var(--color-ktip-ocean-500)'
  }
  return 'var(--color-ktip-tropical-600)'
}

function toEvent(item: TimelineItem, now: Date, withStageMarkers: boolean): GanttEvent {
  const reached = item.stages.filter((stage) => stage.reachedAt)

  return {
    id: item.id,
    title: item.title,
    resourceId: item.id,
    start: new Date(item.startAt),
    end: item.endAt ? new Date(item.endAt) : now,
    allDay: true,
    color: barColorFor(item),
    progress: deriveProgress(item),
    openEnded: item.endAt === null,
    markers: withStageMarkers
      ? reached.map((stage) => ({
          id: stage.key,
          date: new Date(stage.reachedAt!),
          label: stage.label,
        }))
      : undefined,
  }
}

export function timelineToGantt(
  items: TimelineItem[],
  options: TimelineGanttOptions = {}
): TimelineGanttModel {
  const { now = new Date(), includeEmptyGroups = false, withStageMarkers = false } = options

  const resources: GanttResource[] = []
  const events: GanttEvent[] = []
  const itemsById = new Map<string, TimelineItem>()

  for (const kind of ['grant_application', 'project'] as const) {
    // A gantt reads oldest-first top to bottom; buildTimelineItems sorts newest
    // first for the list views, so re-sort here rather than change shared code.
    const own = items
      .filter((item) => item.kind === kind)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())

    if (own.length === 0 && !includeEmptyGroups) continue

    resources.push({
      id: GROUP_ID[kind],
      title: i18n._(GROUP_TITLE[kind]),
      children: own.map((item) => ({ id: item.id, title: item.title })),
    })

    for (const item of own) {
      events.push(toEvent(item, now, withStageMarkers))
      itemsById.set(item.id, item)
    }
  }

  return { resources, events, itemsById }
}
