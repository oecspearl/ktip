import { describe, it, expect } from 'vitest'
import { GROUP_ID, barColorFor, deriveProgress, timelineToGantt } from './timeline-gantt'
import type { TimelineItem } from './timeline'

const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

function item(overrides: Partial<TimelineItem> & Pick<TimelineItem, 'id' | 'kind'>): TimelineItem {
  return {
    title: overrides.id,
    href: `/x/${overrides.id}`,
    startAt: iso(2026, 1, 1),
    endAt: null,
    currentKey: 'pending',
    currentIndex: 0,
    isTerminal: false,
    isRejected: false,
    stages: [
      { key: 'pending', label: 'Applied', reachedAt: iso(2026, 1, 1) },
      { key: 'under_review', label: 'Under Review', reachedAt: null },
      { key: 'decision', label: 'Decision', reachedAt: null },
    ],
    ...overrides,
  }
}

describe('deriveProgress', () => {
  it('is zero at the first stage', () => {
    expect(deriveProgress(item({ id: 'app-1', kind: 'grant_application' }))).toBe(0)
  })

  it('tracks position through the stage list', () => {
    const mid = item({ id: 'app-1', kind: 'grant_application', currentIndex: 1 })
    expect(deriveProgress(mid)).toBeCloseTo(0.5, 6)
  })

  it('is complete for anything terminal, decided or rejected', () => {
    const approved = item({ id: 'app-1', kind: 'grant_application', isTerminal: true, currentIndex: 2 })
    const rejected = item({
      id: 'app-2',
      kind: 'grant_application',
      isTerminal: true,
      isRejected: true,
      currentIndex: 2,
    })
    expect(deriveProgress(approved)).toBe(1)
    expect(deriveProgress(rejected)).toBe(1)
  })
})

describe('barColorFor', () => {
  it('flags rejection over everything else', () => {
    const rejected = item({ id: 'app-1', kind: 'grant_application', isRejected: true })
    expect(barColorFor(rejected)).toBe('var(--color-red-500)')
  })

  it('mutes drafts and colours live applications ocean', () => {
    expect(barColorFor(item({ id: 'a', kind: 'grant_application', currentKey: 'draft' }))).toBe(
      'var(--color-ktip-sand-400)'
    )
    expect(barColorFor(item({ id: 'b', kind: 'grant_application' }))).toBe(
      'var(--color-ktip-ocean-500)'
    )
  })

  it('colours projects tropical', () => {
    expect(barColorFor(item({ id: 'p', kind: 'project' }))).toBe('var(--color-ktip-tropical-600)')
  })
})

describe('timelineToGantt', () => {
  const now = new Date(2026, 5, 1)
  const items: TimelineItem[] = [
    item({ id: 'app-late', kind: 'grant_application', startAt: iso(2026, 3, 1) }),
    item({ id: 'app-early', kind: 'grant_application', startAt: iso(2026, 1, 1) }),
    item({ id: 'project-1', kind: 'project', startAt: iso(2026, 2, 1) }),
  ]

  it('builds one group per kind with children sorted oldest first', () => {
    const model = timelineToGantt(items, { now })
    expect(model.resources.map((r) => r.id)).toEqual([
      GROUP_ID.grant_application,
      GROUP_ID.project,
    ])
    expect(model.resources[0].children?.map((c) => c.id)).toEqual(['app-early', 'app-late'])
  })

  it('keeps child resource ids identical to the timeline item ids', () => {
    const model = timelineToGantt(items, { now })
    const childIds = model.resources.flatMap((r) => r.children?.map((c) => c.id) ?? [])
    expect(childIds.sort()).toEqual(items.map((i) => i.id).sort())
    expect(model.events.map((e) => e.resourceId).sort()).toEqual(childIds.sort())
    expect([...model.itemsById.keys()].sort()).toEqual(childIds.sort())
  })

  it('drops a group with no items unless asked to keep it', () => {
    const grantsOnly = items.filter((i) => i.kind === 'grant_application')
    expect(timelineToGantt(grantsOnly, { now }).resources).toHaveLength(1)
    expect(
      timelineToGantt(grantsOnly, { now, includeEmptyGroups: true }).resources
    ).toHaveLength(2)
  })

  it('runs an open-ended bar to now and flags it', () => {
    const model = timelineToGantt([items[1]], { now })
    expect(model.events[0].openEnded).toBe(true)
    expect(model.events[0].end).toBe(now)
  })

  it('caps a finished bar at its end date', () => {
    const done = item({
      id: 'app-done',
      kind: 'grant_application',
      endAt: iso(2026, 4, 1),
      isTerminal: true,
      currentIndex: 2,
    })
    const model = timelineToGantt([done], { now })
    expect(model.events[0].openEnded).toBe(false)
    expect(model.events[0].end).toEqual(new Date(iso(2026, 4, 1)))
  })

  it('emits markers only for stages actually reached, and only when asked', () => {
    const model = timelineToGantt([items[1]], { now, withStageMarkers: true })
    expect(model.events[0].markers?.map((m) => m.id)).toEqual(['pending'])
    expect(timelineToGantt([items[1]], { now }).events[0].markers).toBeUndefined()
  })
})
