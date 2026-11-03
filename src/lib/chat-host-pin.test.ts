import { describe, expect, it } from 'vitest'
import { firstVisibleRow, newestHostId, pickHostPin, type PinRow } from './chat-host-pin'

// h = host post, m = anyone else. Ids are their positions, for readable asserts.
const thread = (shape: string): PinRow[] =>
  shape.split('').map((c, i) => ({ id: String(i), host: c === 'h' }))

describe('newestHostId', () => {
  it('finds the last host row', () => {
    expect(newestHostId(thread('mhmhm'))).toBe('3')
  })

  it('is null when no host has posted', () => {
    expect(newestHostId(thread('mmm'))).toBeNull()
    expect(newestHostId([])).toBeNull()
  })
})

describe('pickHostPin', () => {
  const rows = thread('mhmmhmmmm') // hosts at 1 and 4

  it('pins the newest host post once it has scrolled above the viewport', () => {
    // At the bottom, rows 6.. in view: both host posts are above.
    expect(pickHostPin(rows, 6)).toBe('4')
  })

  it('skips a host post that is in view and pins the next one above', () => {
    // Row 4 is in view; row 1 is above. The rule is "newest above the
    // viewport", so row 1 is the pin here.
    expect(pickHostPin(rows, 4)).toBe('1')
    // And with everything in view, nothing is above: no pin.
    expect(pickHostPin(rows, 0)).toBeNull()
  })

  it('hands over to the next older host post as the reader scrolls past one', () => {
    expect(pickHostPin(rows, 5)).toBe('4')
    expect(pickHostPin(rows, 4)).toBe('1') // row 4 now visible
    expect(pickHostPin(rows, 2)).toBe('1')
    expect(pickHostPin(rows, 1)).toBeNull() // row 1 now visible too
  })

  it('pins nothing in a thread with no host posts', () => {
    expect(pickHostPin(thread('mmmm'), 4)).toBeNull()
  })

  it('clamps an out-of-range visible index', () => {
    expect(pickHostPin(rows, 99)).toBe('4')
    expect(pickHostPin(rows, -3)).toBeNull()
  })

  it('stays dismissed until a newer host post arrives', () => {
    expect(pickHostPin(rows, 6, '4')).toBeNull()
    // Dismissal covers the older pins too, until something newer lands.
    expect(pickHostPin(rows, 3, '4')).toBeNull()
    const later = [...rows, { id: '9', host: false }, { id: '10', host: true }, { id: '11', host: false }]
    expect(pickHostPin(later, 12, '4')).toBe('10')
  })
})

describe('firstVisibleRow', () => {
  // Five rows, 40px each, stacked from y=100.
  const bottoms = [140, 180, 220, 260, 300]
  const bottomOf = (i: number) => bottoms[i]

  it('finds the first row that ends below the top edge', () => {
    expect(firstVisibleRow(5, bottomOf, 100)).toBe(0)
    expect(firstVisibleRow(5, bottomOf, 150)).toBe(1)
    expect(firstVisibleRow(5, bottomOf, 259)).toBe(3)
  })

  it('treats a row ending exactly on the top edge as above it', () => {
    expect(firstVisibleRow(5, bottomOf, 180)).toBe(2)
  })

  it('returns the count when every row is above', () => {
    expect(firstVisibleRow(5, bottomOf, 500)).toBe(5)
    expect(firstVisibleRow(0, bottomOf, 0)).toBe(0)
  })
})
