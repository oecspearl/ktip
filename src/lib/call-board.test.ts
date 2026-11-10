import { describe, expect, it } from 'vitest'
import { BOARD_HEIGHT, BOARD_WIDTH, boardPoint } from './call-board'

describe('boardPoint', () => {
  it('maps a 16:9 box straight onto the board', () => {
    const box = { left: 100, top: 50, width: 640, height: 360 }
    expect(boardPoint(100, 50, box)).toEqual({ x: 0, y: 0 })
    expect(boardPoint(420, 230, box)).toEqual({ x: 640, y: 360 })
    expect(boardPoint(740, 410, box)).toEqual({ x: BOARD_WIDTH, y: BOARD_HEIGHT })
  })

  it('allows for the bars when the box is taller than the board', () => {
    // 640 wide shows the board 360 tall, centred: 120px bars above and below.
    const box = { left: 0, top: 0, width: 640, height: 600 }
    expect(boardPoint(0, 120, box)).toEqual({ x: 0, y: 0 })
    expect(boardPoint(320, 300, box)).toEqual({ x: 640, y: 360 })
  })

  it('allows for the bars when the box is wider than the board', () => {
    // 360 tall shows the board 640 wide, centred: 180px bars either side.
    const box = { left: 0, top: 0, width: 1000, height: 360 }
    expect(boardPoint(180, 0, box)).toEqual({ x: 0, y: 0 })
    expect(boardPoint(820, 360, box)).toEqual({ x: BOARD_WIDTH, y: BOARD_HEIGHT })
  })

  it('keeps a press on a bar on the nearest edge', () => {
    const box = { left: 0, top: 0, width: 640, height: 600 }
    expect(boardPoint(-20, 10, box)).toEqual({ x: 0, y: 0 })
    expect(boardPoint(700, 590, box)).toEqual({ x: BOARD_WIDTH, y: BOARD_HEIGHT })
  })

  it('does not divide by zero for a box with no size', () => {
    expect(boardPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
  })
})
