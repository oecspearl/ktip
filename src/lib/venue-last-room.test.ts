import { describe, it, expect } from 'vitest'
import { forgetVenueRoom, lastVenueRoom, rememberVenueRoom } from './venue-last-room'

describe('venue-last-room', () => {
  it('remembers the room per event and forgets it once used', () => {
    rememberVenueRoom('ev1', 'room1')
    expect(lastVenueRoom('ev1')).toBe('room1')
    expect(lastVenueRoom('ev2')).toBeNull()
    expect(lastVenueRoom(undefined)).toBeNull()

    // Another event's map must not clear it.
    forgetVenueRoom('ev2')
    expect(lastVenueRoom('ev1')).toBe('room1')

    forgetVenueRoom('ev1')
    expect(lastVenueRoom('ev1')).toBeNull()
  })
})
