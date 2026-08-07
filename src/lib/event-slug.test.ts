import { describe, it, expect } from 'vitest'
import { venuePath, venueRoomPath, venueSetupPath, venueSegmentFor } from './event-slug'

const EVENT = { id: 'd0000000-0000-0000-0000-000000000007', slug: 'oecs-climathon' }

describe('venue paths', () => {
  it('builds the floorplan URL from the event slug', () => {
    expect(venuePath(EVENT)).toBe('/events/virtual-hackathon/oecs-climathon')
  })

  it('addresses a room by its stable key, not its uuid', () => {
    expect(venueRoomPath(EVENT, 'help-desk')).toBe(
      '/events/virtual-hackathon/oecs-climathon/room/help-desk'
    )
  })

  it('falls back to the uuid for an event that predates the slug backfill', () => {
    expect(venuePath({ id: EVENT.id })).toBe(`/events/virtual-hackathon/${EVENT.id}`)
    expect(venueRoomPath({ id: EVENT.id, slug: null }, 'main-hall')).toBe(
      `/events/virtual-hackathon/${EVENT.id}/room/main-hall`
    )
  })
})

describe('per-type venue segments', () => {
  it('gives conferences the virtual-conference front door', () => {
    const conf = { ...EVENT, event_type: 'conference' }
    expect(venuePath(conf)).toBe('/events/virtual-conference/oecs-climathon')
    expect(venueRoomPath(conf, 'main-stage')).toBe(
      '/events/virtual-conference/oecs-climathon/room/main-stage'
    )
    expect(venueSetupPath(conf)).toBe('/events/virtual-conference/oecs-climathon/setup')
  })

  it('keeps the legacy segment for every other type, known or not', () => {
    expect(venuePath({ ...EVENT, event_type: 'hackathon' })).toBe(
      '/events/virtual-hackathon/oecs-climathon'
    )
    expect(venuePath({ ...EVENT, event_type: 'workshop' })).toBe(
      '/events/virtual-hackathon/oecs-climathon'
    )
    expect(venueSegmentFor(null)).toBe('virtual-hackathon')
    expect(venueSegmentFor(undefined)).toBe('virtual-hackathon')
  })
})
