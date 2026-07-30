import { useId } from 'react'
import type { ContentSort } from '../../lib/personalization'
import { Select } from './Select'

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
  const labelId = useId()

  const visible = personalizationActive
    ? options
    : options.filter((o) => o.value !== 'for_you')

  if (visible.length < 2) return null

  return (
    <span className="flex items-center gap-2 text-sm text-ktip-sand-600">
      <span id={labelId} className="shrink-0">
        Sort
      </span>
      <Select<ContentSort>
        value={value}
        onChange={onChange}
        options={visible}
        ariaLabelledBy={labelId}
        align="end"
      />
    </span>
  )
}
