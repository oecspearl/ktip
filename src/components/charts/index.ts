/**
 * The chart kit for the admin analytics hub.
 *
 * recharts enters the bundle only through this directory, and this directory
 * is only imported from src/pages/admin/, which the router loads lazily — so
 * the library lands in the admin chunk and never in a member's first paint.
 * Keep it that way: import from '../../components/charts', never from
 * 'recharts' directly in a page.
 */
export { ChartFrame, type ChartColumn, type ChartInput, type LegendItem } from './ChartFrame'
export { AreaTrend, type AreaSeries, type TrendRow } from './AreaTrend'
export { RadialTarget, STATUS_WORDS } from './RadialTarget'
export { DonutShare, foldShares, type ShareItem } from './DonutShare'
export { HBar, type BarItem } from './HBar'
export { Sparkline } from './Sparkline'
export { useChartPalette, readChartPalette, seriesColor, type ChartPalette } from './palette'
