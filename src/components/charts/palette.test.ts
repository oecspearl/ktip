import { describe, expect, it } from 'vitest'
import { readChartPalette, seriesColor } from './palette'
import { kpiStatus } from '../../lib/kpi-catalog'

const HEX = /^#[0-9A-Fa-f]{6}$/

describe('chart palette', () => {
  it('always yields real colours, even with no stylesheet loaded', () => {
    // jsdom has no index.css, so every token falls back to the validated
    // light set. A chart must never receive an empty string for a fill.
    const palette = readChartPalette()
    expect(palette.series).toHaveLength(5)
    for (const c of [...palette.series, ...palette.sequential, palette.other, palette.grid]) {
      expect(c).toMatch(HEX)
    }
    for (const c of Object.values(palette.status)) expect(c).toMatch(HEX)
  })

  it('prefers the stylesheet over the fallback', () => {
    document.documentElement.style.setProperty('--color-chart-1', '#123456')
    try {
      expect(readChartPalette().series[0]).toBe('#123456')
    } finally {
      document.documentElement.style.removeProperty('--color-chart-1')
    }
  })

  it('folds a sixth series into Other instead of inventing a hue', () => {
    const palette = readChartPalette()
    expect(seriesColor(palette, 4)).toBe(palette.series[4])
    expect(seriesColor(palette, 5)).toBe(palette.other)
    expect(seriesColor(palette, 40)).toBe(palette.other)
  })
})

describe('kpiStatus', () => {
  it('shares one set of thresholds across every surface', () => {
    expect(kpiStatus(null)).toBe('none')
    expect(kpiStatus(1)).toBe('good')
    expect(kpiStatus(1.4)).toBe('good')
    expect(kpiStatus(0.8)).toBe('warn')
    expect(kpiStatus(0.99)).toBe('warn')
    expect(kpiStatus(0.79)).toBe('bad')
    expect(kpiStatus(0)).toBe('bad')
  })
})
