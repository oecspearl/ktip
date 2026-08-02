import { afterEach, describe, expect, it } from 'vitest'
import {
  boxOf,
  clampNotePosition,
  clampSize,
  drainLocalNotes,
  fractionToPixels,
  isGroupOnPage,
  isNoteOnPage,
  makeGroup,
  makeNote,
  nextNoteColor,
  nextNotePosition,
  NOTE_COLORS,
  NOTE_DEFAULT_SIZE,
  NOTE_MAX,
  NOTE_MIN,
  NOTE_MINIMIZED_HEIGHT,
  pixelsToFraction,
  readLocalGroups,
  readLocalNotes,
  writeLocalGroups,
  writeLocalNotes,
} from './sticky-notes'

const VIEWPORT = { width: 1200, height: 800 }
const BOX = NOTE_DEFAULT_SIZE

afterEach(() => {
  window.localStorage.clear()
})

describe('clampNotePosition', () => {
  it('leaves a note that is already fully on screen alone', () => {
    expect(clampNotePosition({ x: 0.3, y: 0.4 }, VIEWPORT, BOX)).toEqual({ x: 0.3, y: 0.4 })
  })

  it('pulls a note back from the right edge by its own width', () => {
    const { x } = clampNotePosition({ x: 0.99, y: 0.1 }, VIEWPORT, BOX)
    expect(x * VIEWPORT.width + BOX.width).toBeLessThanOrEqual(VIEWPORT.width)
  })

  it('pulls a note back from the bottom edge by its own height', () => {
    const { y } = clampNotePosition({ x: 0.1, y: 0.99 }, VIEWPORT, BOX)
    expect(y * VIEWPORT.height + BOX.height).toBeLessThanOrEqual(VIEWPORT.height)
  })

  it('lets a minimized note sit lower, because its box is shorter', () => {
    const open = clampNotePosition({ x: 0.1, y: 0.99 }, VIEWPORT, BOX)
    const collapsed = clampNotePosition({ x: 0.1, y: 0.99 }, VIEWPORT, {
      width: BOX.width,
      height: NOTE_MINIMIZED_HEIGHT,
    })
    expect(collapsed.y).toBeGreaterThan(open.y)
  })

  it('never goes negative past the top-left', () => {
    expect(clampNotePosition({ x: -0.5, y: -2 }, VIEWPORT, BOX)).toEqual({ x: 0, y: 0 })
  })

  it('pins to zero rather than negative on a viewport smaller than the note', () => {
    expect(clampNotePosition({ x: 0.8, y: 0.8 }, { width: 200, height: 100 }, BOX)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('treats a NaN position as the origin instead of propagating it', () => {
    expect(clampNotePosition({ x: NaN, y: NaN }, VIEWPORT, BOX)).toEqual({ x: 0, y: 0 })
  })
})

describe('boxOf', () => {
  it('reports the collapsed height for a minimized note', () => {
    const note = makeNote({ x: 0, y: 0, minimized: true })
    expect(boxOf(note)).toEqual({ width: note.width, height: NOTE_MINIMIZED_HEIGHT })
  })

  it('reports the authored height otherwise', () => {
    const note = makeNote({ x: 0, y: 0, height: 400 })
    expect(boxOf(note).height).toBe(400)
  })
})

describe('clampSize', () => {
  it('holds a resize above the minimum the toolbar needs', () => {
    expect(clampSize({ width: 10, height: 10 })).toEqual(NOTE_MIN)
  })

  it('caps a runaway drag', () => {
    expect(clampSize({ width: 99999, height: 99999 })).toEqual(NOTE_MAX)
  })

  it('rounds, because the column is an integer', () => {
    expect(clampSize({ width: 300.6, height: 260.4 })).toEqual({ width: 301, height: 260 })
  })
})

describe('fraction/pixel round trip', () => {
  it('survives a round trip for a position inside the viewport', () => {
    const start = { x: 0.25, y: 0.5 }
    const back = pixelsToFraction(fractionToPixels(start, VIEWPORT), VIEWPORT, BOX)
    expect(back.x).toBeCloseTo(start.x, 5)
    expect(back.y).toBeCloseTo(start.y, 5)
  })

  it('clamps on the way back from pixels, because pixels come from drags', () => {
    const back = pixelsToFraction({ left: 5000, top: 5000 }, VIEWPORT, BOX)
    expect(back.x * VIEWPORT.width + BOX.width).toBeLessThanOrEqual(VIEWPORT.width)
    expect(back.y * VIEWPORT.height + BOX.height).toBeLessThanOrEqual(VIEWPORT.height)
  })

  it('does not divide by zero on a zero-sized viewport', () => {
    expect(pixelsToFraction({ left: 40, top: 40 }, { width: 0, height: 0 }, BOX)).toEqual({
      x: 0,
      y: 0,
    })
  })
})

describe('nextNotePosition', () => {
  it('cascades so a second note does not hide the first', () => {
    const first = nextNotePosition(0, VIEWPORT)
    const second = nextNotePosition(1, VIEWPORT)
    expect(second.x).toBeGreaterThan(first.x)
    expect(second.y).toBeGreaterThan(first.y)
  })

  it('wraps back to the start after five so it never walks off screen', () => {
    expect(nextNotePosition(5, VIEWPORT)).toEqual(nextNotePosition(0, VIEWPORT))
  })

  it('stays inside the viewport at every cascade step', () => {
    for (let i = 0; i < 10; i++) {
      const pos = nextNotePosition(i, VIEWPORT)
      expect(pos.x * VIEWPORT.width + BOX.width).toBeLessThanOrEqual(VIEWPORT.width)
      expect(pos.y * VIEWPORT.height + BOX.height).toBeLessThanOrEqual(VIEWPORT.height)
    }
  })
})

describe('nextNoteColor', () => {
  it('rotates through the palette and wraps', () => {
    expect(nextNoteColor(0)).toBe(NOTE_COLORS[0])
    expect(nextNoteColor(1)).toBe(NOTE_COLORS[1])
    expect(nextNoteColor(NOTE_COLORS.length)).toBe(NOTE_COLORS[0])
  })
})

describe('page visibility', () => {
  it('keeps an unpinned note on the page it was written on', () => {
    const note = makeNote({ x: 0, y: 0, page_path: '/grants' })
    expect(isNoteOnPage(note, '/grants')).toBe(true)
    expect(isNoteOnPage(note, '/events')).toBe(false)
  })

  it('lets a pinned note travel', () => {
    const note = makeNote({ x: 0, y: 0, page_path: '/grants', pinned: true })
    expect(isNoteOnPage(note, '/events')).toBe(true)
  })

  it('treats a note with no page as belonging everywhere, not nowhere', () => {
    expect(isNoteOnPage(makeNote({ x: 0, y: 0 }), '/anywhere')).toBe(true)
  })

  it('shows a folder wherever one of its notes would have shown', () => {
    const group = makeGroup({ x: 0, y: 0, page_path: '/grants' })
    const pinnedMember = makeNote({ x: 0, y: 0, group_id: group.id, pinned: true })
    expect(isGroupOnPage(group, [pinnedMember], '/events')).toBe(true)
  })

  it('hides a folder whose notes all belong to another page', () => {
    const group = makeGroup({ x: 0, y: 0, page_path: '/grants' })
    const member = makeNote({ x: 0, y: 0, group_id: group.id, page_path: '/grants' })
    expect(isGroupOnPage(group, [member], '/events')).toBe(false)
  })
})

describe('local storage', () => {
  it('round trips notes', () => {
    const note = makeNote({ x: 0.2, y: 0.3, content: '<p>buy milk</p>' })
    writeLocalNotes([note])
    expect(readLocalNotes()).toEqual([note])
  })

  it('returns nothing when the store is empty or unparseable', () => {
    expect(readLocalNotes()).toEqual([])
    window.localStorage.setItem('ktip_sticky_notes', 'not json')
    expect(readLocalNotes()).toEqual([])
  })

  it('drops entries that are not notes rather than rendering junk', () => {
    const good = makeNote({ x: 0.1, y: 0.1 })
    window.localStorage.setItem('ktip_sticky_notes', JSON.stringify([good, { id: 7 }, null]))
    expect(readLocalNotes()).toEqual([good])
  })

  it('drops a folder that no longer holds anything', () => {
    const kept = makeGroup({ x: 0.1, y: 0.1 })
    const empty = makeGroup({ x: 0.2, y: 0.2 })
    writeLocalNotes([makeNote({ x: 0, y: 0, group_id: kept.id })])
    writeLocalGroups([kept, empty])
    expect(readLocalGroups()).toEqual([kept])
  })

  it('drains once — a second drain finds nothing, so a merge cannot double up', () => {
    const group = makeGroup({ x: 0.1, y: 0.1 })
    writeLocalNotes([makeNote({ x: 0.1, y: 0.1, group_id: group.id })])
    writeLocalGroups([group])

    const first = drainLocalNotes()
    expect(first.notes).toHaveLength(1)
    expect(first.groups).toHaveLength(1)

    expect(drainLocalNotes()).toEqual({ notes: [], groups: [] })
    expect(readLocalNotes()).toEqual([])
  })
})
