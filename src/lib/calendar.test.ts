import { describe, expect, it } from 'vitest'
import { foldRsvpsIntoEvents, groupItemsByDay, rsvpRelation } from './calendar'
import type { CalendarItem } from './calendar'

function eventRow(id: string): CalendarItem {
  return {
    id: `event:${id}`,
    kind: 'event',
    title: 'OECS Climathon',
    start: '2026-08-02T14:00:00.000Z',
    chipClass: 'chip',
    dotClass: 'bg-ktip-ocean-500',
  }
}

describe('rsvpRelation', () => {
  it('reads as the viewer standing, not the raw row status', () => {
    expect(rsvpRelation('confirmed').label).toBe('Registered')
    expect(rsvpRelation('waitlisted').label).toBe('Waitlisted')
  })

  it('marks a withdrawn registration negative so the badge does not read as a tick', () => {
    const relation = rsvpRelation('cancelled')
    expect(relation.negative).toBe(true)
    expect(relation.detail).toBeTruthy()
  })

  it('falls back for an unknown status rather than rendering blank', () => {
    expect(rsvpRelation('teleported').label).toBe('Registered')
    expect(rsvpRelation('teleported').dotClass).toBeTruthy()
  })
})

describe('foldRsvpsIntoEvents', () => {
  it('annotates the event instead of adding a second row for it', () => {
    const event = eventRow('e1')
    const items = new Map([['e1', event]])

    const orphans = foldRsvpsIntoEvents(items, [{ event_id: 'e1', status: 'confirmed' }])

    expect(orphans).toEqual([])
    expect(event.relation?.label).toBe('Registered')
    expect(event.mine).toBe(true)
    // The event keeps its own type colour; only the second half is the relation
    expect(event.dotClass).toBe('bg-ktip-ocean-500')
    expect(event.relation?.dotClass).not.toBe(event.dotClass)
  })

  it('returns registrations whose event has no row, so nothing vanishes', () => {
    const orphans = foldRsvpsIntoEvents(new Map(), [{ event_id: 'draft', status: 'confirmed' }])
    expect(orphans).toEqual([{ event_id: 'draft', status: 'confirmed' }])
  })

  it('leaves unregistered events untouched', () => {
    const event = eventRow('e1')
    foldRsvpsIntoEvents(new Map([['e1', event]]), [])
    expect(event.relation).toBeUndefined()
    expect(event.mine).toBeUndefined()
  })

  it('produces one day-cell entry for a registered event', () => {
    const event = eventRow('e1')
    foldRsvpsIntoEvents(new Map([['e1', event]]), [{ event_id: 'e1', status: 'confirmed' }])

    const byDay = groupItemsByDay(
      [event],
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.000Z')
    )

    expect([...byDay.values()].flat()).toHaveLength(1)
  })
})
