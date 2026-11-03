import { describe, expect, it } from 'vitest'
import { parseTakedownTarget } from './takedown-target'

describe('parseTakedownTarget', () => {
  it('reads a full resource URL', () => {
    expect(parseTakedownTarget('https://ktip.oecs.int/resources/green-finance-guide')).toEqual({
      type: 'resource',
      key: 'green-finance-guide',
    })
  })

  it('reads a bare path and a uuid', () => {
    expect(parseTakedownTarget('/projects/0b5f4c1e-8a1d-4d55-9a57-3f0b0f9a1c2d?tab=team')).toEqual({
      type: 'project',
      key: '0b5f4c1e-8a1d-4d55-9a57-3f0b0f9a1c2d',
    })
    expect(parseTakedownTarget('/events/blue-economy-sprint/')).toEqual({ type: 'event', key: 'blue-economy-sprint' })
  })

  it('ignores pages a takedown cannot hide', () => {
    expect(parseTakedownTarget('/forums/general/123')).toBeNull()
    expect(parseTakedownTarget('/resources')).toBeNull()
    expect(parseTakedownTarget('/projects/new')).toBeNull()
    expect(parseTakedownTarget('')).toBeNull()
    expect(parseTakedownTarget(null)).toBeNull()
  })
})
