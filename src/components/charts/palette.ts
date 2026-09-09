import { useEffect, useState } from 'react'
import type { KpiStatus } from '../../lib/kpi-catalog'

/**
 * The chart palette, read from the stylesheet at draw time.
 *
 * Every other colour in the app is a Tailwind class, and the ramps invert
 * under html.dark so a class never needs a `dark:` twin. An SVG mark cannot
 * take a class for its fill in recharts — it needs a literal — so the chart
 * tokens declared in index.css are read back through getComputedStyle here,
 * and re-read the moment the dark class flips.
 *
 * Nothing in this module is a colour decision. The values live in index.css
 * next to the ramps, where they were validated; the fallbacks below are the
 * light set verbatim, for jsdom (no stylesheet) and for the first paint before
 * the effect runs.
 */
export interface ChartPalette {
  /** Identity: five fixed slots, assigned in order, never cycled. */
  series: readonly string[]
  /** Where a sixth-and-later series folds to. */
  other: string
  /** Magnitude: one hue, light to dark. */
  sequential: readonly string[]
  /** State against a target. Reserved — never a series colour. */
  status: Record<KpiStatus, string>
  grid: string
  axis: string
  label: string
  /** The card the chart sits on, for the 2px gaps between adjacent fills. */
  surface: string
}

const LIGHT_FALLBACK: ChartPalette = {
  series: ['#2560A8', '#B38500', '#8E3B8E', '#5E8A00', '#C2416B'],
  other: '#86867F',
  sequential: ['#D3DEEC', '#A9BFDB', '#7E9EC7', '#4F7AAE', '#2A5788'],
  status: { good: '#5E8A00', warn: '#B38500', bad: '#B23A3A', none: '#A9A9A2' },
  grid: '#E3E3DF',
  axis: '#D3D3CE',
  label: '#63635D',
  surface: '#F4F4F2',
}

const SERIES_SLOTS = 5

/** A token if the stylesheet declares it, else the light fallback. */
function token(style: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const value = style?.getPropertyValue(name).trim()
  return value ? value : fallback
}

export function readChartPalette(root: Element | null = globalThis.document?.documentElement): ChartPalette {
  const style = root && typeof getComputedStyle === 'function' ? getComputedStyle(root) : null
  return {
    series: LIGHT_FALLBACK.series.map((fallback, i) => token(style, `--color-chart-${i + 1}`, fallback)),
    other: token(style, '--color-chart-other', LIGHT_FALLBACK.other),
    sequential: LIGHT_FALLBACK.sequential.map((fallback, i) =>
      token(style, `--color-chart-seq-${i + 1}`, fallback),
    ),
    status: {
      good: token(style, '--color-chart-good', LIGHT_FALLBACK.status.good),
      warn: token(style, '--color-chart-warn', LIGHT_FALLBACK.status.warn),
      bad: token(style, '--color-chart-bad', LIGHT_FALLBACK.status.bad),
      none: token(style, '--color-chart-none', LIGHT_FALLBACK.status.none),
    },
    grid: token(style, '--color-chart-grid', LIGHT_FALLBACK.grid),
    axis: token(style, '--color-chart-axis', LIGHT_FALLBACK.axis),
    label: token(style, '--color-chart-label', LIGHT_FALLBACK.label),
    surface: token(style, '--color-ktip-cream', LIGHT_FALLBACK.surface),
  }
}

/**
 * The colour for series `index`: one of the five slots, or `other` past them.
 *
 * Folding rather than generating a sixth hue is deliberate — past five the
 * adjacent pairs stop clearing the colour-vision floor, and "Other" is the
 * honest name for a bucket the reader cannot tell apart anyway.
 */
export function seriesColor(palette: ChartPalette, index: number): string {
  return index < SERIES_SLOTS ? palette.series[index] : palette.other
}

/**
 * The live palette, re-read when the theme flips.
 *
 * useThemeMode toggles `dark` on <html>; a MutationObserver on that class
 * attribute is the only signal a chart gets, since the tokens themselves
 * change without any React state moving.
 */
export function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(readChartPalette)

  useEffect(() => {
    const root = document.documentElement
    setPalette(readChartPalette(root))
    const observer = new MutationObserver(() => setPalette(readChartPalette(root)))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return palette
}
