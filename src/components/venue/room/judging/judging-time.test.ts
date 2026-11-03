import { describe, expect, it } from 'vitest'
import { clockLeft } from './judging-time'

const H = 3_600_000
const M = 60_000
const S = 1_000

describe('clockLeft', () => {
  it('pads hours, minutes and seconds', () => {
    expect(clockLeft(18 * H + 41 * M + 24 * S)).toBe('18:41:24')
    expect(clockLeft(5 * S)).toBe('00:00:05')
  })

  it('drops the part second rather than rounding up', () => {
    expect(clockLeft(59 * S + 999)).toBe('00:00:59')
  })

  it('runs the hours past 24 up to 48', () => {
    expect(clockLeft(41 * H + 12 * M + 9 * S)).toBe('41:12:09')
    expect(clockLeft(48 * H)).toBe('48:00:00')
  })

  it('switches to days above 48 hours', () => {
    expect(clockLeft(48 * H + S)).toBe('2d 00:00:01')
    expect(clockLeft(3 * 24 * H + 4 * H + 12 * M + 9 * S)).toBe('3d 04:12:09')
  })

  it('never goes negative', () => {
    expect(clockLeft(-5 * S)).toBe('00:00:00')
  })
})
