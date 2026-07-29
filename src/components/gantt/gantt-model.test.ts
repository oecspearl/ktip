import { describe, it, expect } from 'vitest'
import {
  assignLanes,
  buildRows,
  collectDescendantEvents,
  groupEventsByResource,
  summarizeEvents,
} from './gantt-model'
import type { GanttEvent, GanttResource } from './gantt-types'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

const event = (
  id: string,
  start: Date,
  end: Date,
  extra: Partial<GanttEvent> = {}
): GanttEvent => ({ id, title: id, resourceId: extra.resourceId ?? 'r', start, end, ...extra })

describe('assignLanes', () => {
  it('packs disjoint events into one lane', () => {
    const events = [
      event('a', d(2026, 2, 1), d(2026, 2, 5)),
      event('b', d(2026, 2, 10), d(2026, 2, 14)),
      event('c', d(2026, 2, 20), d(2026, 2, 24)),
    ]
    expect(assignLanes(events, 48)).toHaveLength(1)
  })

  it('gives every fully overlapping event its own lane', () => {
    const events = [
      event('a', d(2026, 2, 1), d(2026, 2, 20)),
      event('b', d(2026, 2, 2), d(2026, 2, 21)),
      event('c', d(2026, 2, 3), d(2026, 2, 22)),
    ]
    expect(assignLanes(events, 48)).toHaveLength(3)
  })

  it('reuses a lane once it is free — chained overlaps need only two', () => {
    const events = [
      event('a', d(2026, 2, 1), d(2026, 2, 5)),
      event('b', d(2026, 2, 4), d(2026, 2, 8)),
      event('c', d(2026, 2, 7), d(2026, 2, 11)),
    ]
    const lanes = assignLanes(events, 48)
    expect(lanes).toHaveLength(2)
    expect(lanes[0].map((e) => e.id)).toEqual(['a', 'c'])
    expect(lanes[1].map((e) => e.id)).toEqual(['b'])
  })

  it('splits at coarse scales what fits on one lane when zoomed in', () => {
    // One day apart: 48px of clearance at week scale, 3px at quarter scale.
    const events = [
      event('a', d(2026, 2, 1), d(2026, 2, 2)),
      event('b', d(2026, 2, 3), d(2026, 2, 4)),
    ]
    expect(assignLanes(events, 48)).toHaveLength(1)
    expect(assignLanes(events, 3)).toHaveLength(2)
  })

  it('is stable however the input is ordered', () => {
    const events = [
      event('a', d(2026, 2, 1), d(2026, 2, 20)),
      event('b', d(2026, 2, 2), d(2026, 2, 21)),
    ]
    const forward = assignLanes(events, 48).map((lane) => lane.map((e) => e.id))
    const reversed = assignLanes([...events].reverse(), 48).map((lane) => lane.map((e) => e.id))
    expect(reversed).toEqual(forward)
  })

  it('returns no lanes for no events', () => {
    expect(assignLanes([], 48)).toEqual([])
  })
})

describe('summarizeEvents', () => {
  it('is null when there is nothing to roll up', () => {
    expect(summarizeEvents([])).toBeNull()
  })

  it('spans min start to max end', () => {
    const summary = summarizeEvents([
      event('a', d(2026, 2, 10), d(2026, 3, 1)),
      event('b', d(2026, 1, 5), d(2026, 2, 20)),
    ])!
    expect(summary.start).toEqual(d(2026, 1, 5))
    expect(summary.end).toEqual(d(2026, 3, 1))
    expect(summary.count).toBe(2)
  })

  it('weights progress by duration rather than averaging bars', () => {
    const summary = summarizeEvents([
      event('long', d(2026, 1, 1), d(2026, 6, 30), { progress: 0.5 }), // 180 days
      event('short', d(2026, 3, 1), d(2026, 3, 3), { progress: 0 }), // 2 days
    ])!
    // A plain mean would say 0.25. Weighted: 90 / 182.
    expect(summary.progress).toBeCloseTo(90 / 182, 6)
  })

  it('falls back to a plain mean when every item is zero-length', () => {
    const summary = summarizeEvents([
      event('a', d(2026, 2, 1), d(2026, 2, 1), { progress: 1 }),
      event('b', d(2026, 2, 1), d(2026, 2, 1), { progress: 0 }),
    ])!
    // The one-day floor keeps these weighted, not discarded.
    expect(summary.progress).toBeCloseTo(0.5, 6)
  })
})

describe('groupEventsByResource / collectDescendantEvents', () => {
  const tree: GanttResource = {
    id: 'group',
    title: 'Group',
    children: [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ],
  }
  const events = [
    event('e1', d(2026, 2, 1), d(2026, 2, 5), { resourceId: 'a' }),
    event('e2', d(2026, 2, 6), d(2026, 2, 9), { resourceId: 'b' }),
    event('e3', d(2026, 3, 1), d(2026, 3, 5), { resourceId: 'orphan' }),
  ]

  it('buckets by resource id', () => {
    const byResource = groupEventsByResource(events)
    expect([...byResource.keys()].sort()).toEqual(['a', 'b', 'orphan'])
  })

  it('gathers the whole subtree', () => {
    const byResource = groupEventsByResource(events)
    expect(collectDescendantEvents(tree, byResource).map((e) => e.id)).toEqual(['e1', 'e2'])
  })
})

describe('buildRows', () => {
  const resources: GanttResource[] = [
    {
      id: 'grants',
      title: 'Grant Applications',
      children: [
        { id: 'app-1', title: 'App 1' },
        { id: 'app-2', title: 'App 2' },
      ],
    },
    { id: 'projects', title: 'Projects', children: [{ id: 'proj-1', title: 'Project 1' }] },
  ]
  const events = [
    event('app-1', d(2026, 1, 1), d(2026, 2, 1), { resourceId: 'app-1', progress: 1 }),
    event('app-2', d(2026, 2, 1), d(2026, 3, 1), { resourceId: 'app-2', progress: 0.5 }),
    event('proj-1', d(2026, 1, 15), d(2026, 4, 1), { resourceId: 'proj-1', progress: 0.25 }),
  ]

  it('flattens depth-first with depth and parent recorded', () => {
    const rows = buildRows({ resources, events, collapsed: new Set(), pxPerDay: 8 })
    expect(rows.map((r) => r.id)).toEqual(['grants', 'app-1', 'app-2', 'projects', 'proj-1'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0, 1])
    expect(rows[1].parentId).toBe('grants')
  })

  it('elides the children of a collapsed group but keeps its roll-up', () => {
    const rows = buildRows({ resources, events, collapsed: new Set(['grants']), pxPerDay: 8 })
    expect(rows.map((r) => r.id)).toEqual(['grants', 'projects', 'proj-1'])
    expect(rows[0].collapsed).toBe(true)
    expect(rows[0].summary?.count).toBe(2)
    expect(rows[0].summary?.start).toEqual(d(2026, 1, 1))
    expect(rows[0].summary?.end).toEqual(d(2026, 3, 1))
  })

  it('carries bars on leaf rows only', () => {
    const rows = buildRows({ resources, events, collapsed: new Set(), pxPerDay: 8 })
    expect(rows[0].lanes).toEqual([])
    expect(rows[1].lanes[0].map((e) => e.id)).toEqual(['app-1'])
    expect(rows[1].summary).toBeNull()
  })

  it('grows leaf rows with lane count and keeps group rows compact', () => {
    const rows = buildRows({ resources, events, collapsed: new Set(), pxPerDay: 8 })
    expect(rows[0].height).toBe(40) // group
    expect(rows[1].height).toBe(56) // one lane, floor applies

    const stacked = [
      event('x1', d(2026, 1, 1), d(2026, 3, 1), { resourceId: 'proj-1' }),
      event('x2', d(2026, 1, 5), d(2026, 3, 5), { resourceId: 'proj-1' }),
      event('x3', d(2026, 1, 9), d(2026, 3, 9), { resourceId: 'proj-1' }),
    ]
    const tall = buildRows({ resources, events: stacked, collapsed: new Set(), pxPerDay: 8 })
    const leaf = tall.find((r) => r.id === 'proj-1')!
    expect(leaf.laneCount).toBe(3)
    expect(leaf.height).toBe(12 * 2 + 3 * 20)
  })
})
