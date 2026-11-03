import { describe, expect, it } from 'vitest'
import {
  FURNITURE_PRESETS,
  furnish,
  furnitureFor,
  homebaseItems,
  largestRect,
  parseDecor,
  type FurniturePiece,
} from './venue-furniture'
import { rectCells } from './venue-map'

const inside = (p: FurniturePiece, x0: number, y0: number, x1: number, y1: number) => {
  if (p.type === 'box' || p.type === 'rug') {
    return p.x >= x0 - 1e-9 && p.y >= y0 - 1e-9 && p.x + p.w <= x1 + 1e-9 && p.y + p.d <= y1 + 1e-9
  }
  return true
}

describe('largestRect', () => {
  it('finds the whole rectangle for a rectangular room', () => {
    expect(largestRect(rectCells(2, 3, 7, 6))).toEqual({ x0: 2, y0: 3, x1: 8, y1: 7 })
  })

  it('finds the big part of an L-shaped room, not the alcove', () => {
    const cells = [...rectCells(0, 0, 5, 3), ...rectCells(0, 4, 1, 6)]
    expect(largestRect(cells)).toEqual({ x0: 0, y0: 0, x1: 6, y1: 4 })
  })

  it('returns null for no cells', () => {
    expect(largestRect([])).toBeNull()
  })
})

describe('furnitureFor', () => {
  it('uses the kind default when no preset is stored', () => {
    expect(furnitureFor({ kind: 'main_hall' })).toBe('theatre')
    expect(furnitureFor({ kind: 'team', furniture: null })).toBe('homebase')
    expect(furnitureFor({ kind: 'workshop' })).toBe('classroom')
  })

  it('uses the stored preset over the kind', () => {
    expect(furnitureFor({ kind: 'breakout', furniture: 'podium' })).toBe('podium')
  })

  it('ignores an unknown preset', () => {
    expect(furnitureFor({ kind: 'judging', furniture: 'spaceship' })).toBe('panel')
  })
})

describe('furnish', () => {
  const cells = rectCells(4, 2, 11, 8)

  it.each(FURNITURE_PRESETS.filter((p) => p !== 'none'))('%s stays inside the room', (preset) => {
    const pieces = furnish({ cells, height: 1.4 }, preset)
    expect(pieces.length).toBeGreaterThan(0)
    for (const p of pieces) expect(inside(p, 4, 2, 12, 9)).toBe(true)
  })

  it('draws nothing for "none" or a room too small to stand in', () => {
    expect(furnish({ cells, height: 1 }, 'none')).toEqual([])
    expect(furnish({ cells: [[0, 0]], height: 1 }, 'theatre')).toEqual([])
  })

  it('keeps wall panels at or below the wall top', () => {
    for (const preset of FURNITURE_PRESETS) {
      for (const p of furnish({ cells, height: 0.9 }, preset)) {
        if (p.type === 'panel' && p.art !== 'monitor') expect(p.z1).toBeLessThanOrEqual(0.9)
      }
    }
  })

  it('is sorted back to front', () => {
    const pieces = furnish({ cells, height: 1.2 }, 'cafe')
    for (let i = 1; i < pieces.length; i++) expect(pieces[i].depth).toBeGreaterThanOrEqual(pieces[i - 1].depth)
  })

  it('a classroom has a chalkboard', () => {
    const arts = furnish({ cells, height: 1.4 }, 'classroom').flatMap((p) => (p.type === 'panel' ? [p.art] : []))
    expect(arts).toContain('chalkboard')
  })
})

describe('homebase decor', () => {
  const cells = rectCells(0, 0, 5, 4)
  const arts = (decor = {}) =>
    furnish({ cells, height: 1.2 }, 'homebase', decor).flatMap((p) => (p.type === 'panel' ? [p.art] : []))

  it('has a video wall, task board and whiteboard by default', () => {
    expect(arts()).toEqual(expect.arrayContaining(['video', 'kanban', 'whiteboard']))
  })

  it('drops an item the team switched off', () => {
    expect(arts({ items: { video: false } })).not.toContain('video')
  })

  it('hangs the logo on the banner when there is one', () => {
    const banner = furnish({ cells, height: 1.2 }, 'homebase', {
      items: { banner: true },
      logo_path: 'room/logo-1.png',
    }).find((p) => p.type === 'panel' && p.art === 'banner')
    expect(banner && banner.type === 'panel' && banner.image).toBe('logo')
  })

  it('lays a rug when asked', () => {
    const pieces = furnish({ cells, height: 1.2 }, 'homebase', { items: { rug: true } })
    expect(pieces.some((p) => p.type === 'rug')).toBe(true)
  })
})

describe('parseDecor', () => {
  it('keeps only valid fields', () => {
    expect(
      parseDecor({ color: '#12ab34', items: { video: false, rocket: true, sofa: 'yes' }, logo_path: 'r/l.png', extra: 1 })
    ).toEqual({ color: '#12ab34', items: { video: false }, logo_path: 'r/l.png' })
  })

  it('rejects a colour that is not #rrggbb', () => {
    expect(parseDecor({ color: 'red' })).toEqual({})
  })

  it('falls back to defaults for missing items', () => {
    expect(homebaseItems({}).video).toBe(true)
    expect(homebaseItems({ items: { video: false } }).video).toBe(false)
  })

  it('treats junk as no decor', () => {
    expect(parseDecor(null)).toEqual({})
    expect(parseDecor([1, 2])).toEqual({})
    expect(parseDecor('x')).toEqual({})
  })
})
