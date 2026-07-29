import type { ContentSort } from '../../lib/personalization'

interface SortSelectProps {
  value: ContentSort
  onChange: (sort: ContentSort) => void
  options: { value: ContentSort; label: string }[]
  /** Hide "For You" when the ranker cannot do anything — signed out, or off. */
  personalizationActive: boolean
}

/**
 * Sort control for the content list pages. Styled to match the filter
 * selects that already sit next to it rather than introducing a new control
 * shape for one feature.
 */
export function SortSelect({
  value,
  onChange,
  options,
  personalizationActive,
}: SortSelectProps) {
  const visible = personalizationActive
    ? options
    : options.filter((o) => o.value !== 'for_you')

  if (visible.length < 2) return null

  return (
    <label className="flex items-center gap-2 text-sm text-ktip-sand-600">
      <span className="shrink-0">Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as ContentSort)}
        aria-label="Sort results"
        className="px-3 py-2 border border-gray-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
      >
        {visible.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
