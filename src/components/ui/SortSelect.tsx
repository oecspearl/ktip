import { useId } from 'react'
import type { ContentSort } from '../../lib/personalization'
import { Select } from './Select'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy, type Copy } from '../../i18n/copy'

interface SortSelectProps {
  value: ContentSort
  onChange: (sort: ContentSort) => void
  /**
   * `Copy`, so a caller can pass the `msg` descriptors from personalization.ts
   * straight through. Resolved here rather than at each of the four call sites —
   * the component is the one place that knows these end up on a screen.
   */
  options: { value: ContentSort; label: Copy }[]
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
  const { i18n } = useLingui()

  const visible = (
    personalizationActive ? options : options.filter((o) => o.value !== 'for_you')
  ).map((o) => ({ value: o.value, label: resolveCopy(i18n, o.label) }))

  if (visible.length < 2) return null

  return (
    <span className="flex items-center gap-2 text-sm text-ktip-sand-600">
      <span id={labelId} className="shrink-0">
        <Trans>Sort</Trans>
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
