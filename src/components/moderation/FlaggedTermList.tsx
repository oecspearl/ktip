import { X } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import type { MergedRange } from '../../lib/moderation/scan'

interface FlaggedTermListProps {
  id: string
  terms: string[]
  ranges: MergedRange[]
  value: string
  onRemove: (range: MergedRange) => void
}

/**
 * The flagged words as removable chips, under the field.
 *
 * Not a convenience. The strikethrough conveys its meaning through colour and
 * a text decoration alone, which is not sufficient on its own, and tapping a
 * precise word inside a textarea on a phone is miserable. This row is the
 * keyboard path, the screen-reader path and the mobile path to the same
 * action, and it is what makes the affordance discoverable at all.
 */
export function FlaggedTermList({ id, terms, ranges, value, onRemove }: FlaggedTermListProps) {
  const { t } = useLingui()
  if (terms.length === 0) return null

  return (
    <div id={id} aria-live="polite" className="flex flex-wrap items-center gap-1.5">
      <span className="text-caption text-ktip-sand-600">{t`Flagged:`}</span>
      {ranges.map((range) => {
        const text = value.slice(range.start, range.end).trim()
        if (!text) return null
        return (
          <button
            key={`${range.start}-${range.end}`}
            type="button"
            onClick={() => onRemove(range)}
            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-caption text-red-700 transition-colors hover:bg-red-100"
            aria-label={t`Remove "${text}"`}
          >
            <span className="line-through">{text}</span>
            <X size={12} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

export default FlaggedTermList
