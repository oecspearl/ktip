import { describe, it, expect } from 'vitest'
import { eventManagePath, venuePath, venueRoomPath, venueSegmentFor } from './event-slug'

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

describe('the management console URL', () => {
  it('is one address per event, with the tab as a query', () => {
    expect(eventManagePath(EVENT)).toBe('/events/oecs-climathon/manage')
    expect(eventManagePath(EVENT, { tab: 'venue' })).toBe('/events/oecs-climathon/manage?tab=venue')
  })

  it('carries the setup flag so the console can draw the stepper', () => {
    expect(eventManagePath(EVENT, { tab: 'details', setup: true })).toBe(
      '/events/oecs-climathon/manage?tab=details&setup=1'
    )
  })

  it('falls back to the uuid like every other event path', () => {
    expect(eventManagePath({ id: EVENT.id, slug: null })).toBe(`/events/${EVENT.id}/manage`)
  })
})
