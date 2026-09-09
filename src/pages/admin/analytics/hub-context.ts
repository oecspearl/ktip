import type { HubFilters, Period, TrendWindow } from './analytics-filters'

/** What every tab receives from the shell. */
export interface HubProps {
  filters: HubFilters
  /** The period the tiles report on. */
  period: Period
  /** The wider window the trend charts draw. */
  trend: TrendWindow
  /** The country filter, or null for the platform. */
  country: string | null
}

/** Subtitle fragment for a card that cannot honour the country filter. */
export function scopeNote(country: string | null): string | undefined {
  return country ? 'all countries — this figure has no country breakdown' : undefined
}
