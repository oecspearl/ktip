import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

import { guestOf, isLive, type TeamBridge } from './useBridges'

const now = Date.parse('2026-11-07T14:00:00Z')
const bridge = (over: Partial<TeamBridge>): TeamBridge => ({
  id: 'b1',
  event_id: 'e',
  from_team_id: 'alpha',
  to_team_id: 'breadfruit',
  message: null,
  minutes: 30,
  status: 'open',
  expires_at: '2026-11-07T14:20:00Z',
  created_at: '2026-11-07T13:50:00Z',
  ...over,
})

describe('bridges', () => {
  it('is live while open and before it expires', () => {
    expect(isLive(bridge({}), now)).toBe(true)
    expect(isLive(bridge({ expires_at: '2026-11-07T13:59:59Z' }), now)).toBe(false)
    expect(isLive(bridge({ status: 'pending', expires_at: null }), now)).toBe(false)
    expect(isLive(bridge({ status: 'ended' }), now)).toBe(false)
  })

  it('lets only the visiting team in, only while live', () => {
    const list = [bridge({}), bridge({ id: 'b2', from_team_id: 'sargassum', to_team_id: 'pitons' })]
    expect([...guestOf(list, 'alpha', now)]).toEqual(['breadfruit'])
    expect([...guestOf(list, 'breadfruit', now)]).toEqual([])
    expect([...guestOf(list, undefined, now)]).toEqual([])
  })
})
