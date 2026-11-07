import { describe, it, expect } from 'vitest'
import { pickTarget } from '../../../api/venue/room-token'

describe('room-token pickTarget', () => {
  it('routes each id to its own grant function', () => {
    expect(pickTarget({ roomId: 'r' })).toEqual({ rpc: 'venue_room_grant', args: { p_room_id: 'r' } })
    expect(pickTarget({ coffeeTableId: 't' })).toEqual({ rpc: 'coffee_table_grant', args: { p_table_id: 't' } })
    expect(pickTarget({ callId: 'c' })).toEqual({ rpc: 'video_call_grant', args: { p_call_id: 'c' } })
  })

  it('refuses none, several, or ids that are not strings', () => {
    expect(pickTarget({})).toBeNull()
    expect(pickTarget({ roomId: '' })).toBeNull()
    expect(pickTarget({ roomId: 42 })).toBeNull()
    expect(pickTarget({ roomId: 'r', callId: 'c' })).toBeNull()
    expect(pickTarget({ coffeeTableId: 't', callId: 'c' })).toBeNull()
  })
})
