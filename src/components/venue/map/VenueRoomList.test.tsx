import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { VenueRoomList } from './VenueRoomList'
import type { VenueMapConfig } from '../../../lib/venue-map'
import type { VenueRoom } from '../../../types'

afterEach(cleanup)

const config: VenueMapConfig = {
  v: 1,
  cols: 20,
  rows: 14,
  floors: [
    { key: 'ground', name: 'Ground · Arrivals', door: { side: 's', at: 10 } },
    { key: 'l1', name: 'Level 1 · Homebase wing A', door: { side: 's', at: 10 } },
  ],
  stairs: null,
} as unknown as VenueMapConfig

const room = (id: string, name: string, floor: number): VenueRoom =>
  ({
    id,
    key: id,
    name,
    kind: 'lounge',
    floor,
    sort_order: 0,
    capacity: null,
    is_open: true,
  }) as unknown as VenueRoom

const rooms = [room('a', 'Lobby', 0), room('b', 'Pod One', 1)]

function list(currentFloor: number) {
  return (
    <VenueRoomList
      bare
      config={config}
      rooms={rooms}
      occupancy={{}}
      currentFloor={currentFloor}
      onPick={() => {}}
    />
  )
}

const header = (name: string) => screen.getByRole('button', { name: new RegExp(name) })

describe('VenueRoomList floors', () => {
  it('opens the floor being stood on and folds the rest', () => {
    render(list(1))
    expect(header('Level 1').getAttribute('aria-expanded')).toBe('true')
    expect(header('Ground').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Pod One')).not.toBeNull()
    expect(screen.queryByText('Lobby')).toBeNull()
  })

  it('lets another floor be peeked at, then follows the next floor change', () => {
    const { rerender } = render(list(0))
    fireEvent.click(header('Level 1'))
    expect(header('Level 1').getAttribute('aria-expanded')).toBe('true')
    expect(header('Ground').getAttribute('aria-expanded')).toBe('false')

    // Walking upstairs and back down re-syncs to where you are.
    rerender(list(1))
    rerender(list(0))
    expect(header('Ground').getAttribute('aria-expanded')).toBe('true')
    expect(header('Level 1').getAttribute('aria-expanded')).toBe('false')
  })

  it('folds the open floor when its header is clicked', () => {
    render(list(0))
    fireEvent.click(header('Ground'))
    expect(header('Ground').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Lobby')).toBeNull()
  })
})
