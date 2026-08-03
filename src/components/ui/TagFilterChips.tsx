import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'

interface TagFilterChipsProps {
  /** Full vocabulary, most common first — see useTagVocabulary. */
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  /** Chips shown before the "Show all" expander. */
  collapsedCount?: number
  label?: string
}

/**
 * Multi-select tag filter. Renders nothing until content is actually tagged,
 * so the filter row stays clean on entities nobody has tagged yet.
 */
export function TagFilterChips({
  options,
  selected,
  onChange,
  collapsedCount = 12,
  label,
}: TagFilterChipsProps) {
  const { t } = useLingui()
  const [expanded, setExpanded] = useState(false)
  // Destructuring defaults run before the body, where `t` does not exist yet.
  const heading = label ?? t`Tags`

  if (options.length === 0) return null

  // Selected tags stay visible even when they sit past the collapse cutoff.
  //
  // The callback params below were named `t`, which now shadows the `t` from
  // useLingui. Harmless here — neither callback uses a macro — but renamed
  // because the next person to add one inside them would get a very confusing
  // error.
  const visible = expanded
    ? options
    : [
        ...new Set([
          ...options.slice(0, collapsedCount),
          ...selected.filter((tag) => options.includes(tag)),
        ]),
      ]

  const hiddenCount = options.length - visible.length

  const toggle = (tag: string) =>
    onChange(selected.includes(tag) ? selected.filter((other) => other !== tag) : [...selected, tag])

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
          {heading}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
          >
            <X size={11} />
            <Trans>Clear</Trans>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visible.map((tag) => {
          const active = selected.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(tag)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                active
                  ? 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200'
                  : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300 hover:text-ktip-ocean-700 hover:bg-ktip-ocean-50'
              )}
            >
              {tag}
            </button>
          )
        })}

        {options.length > visible.length && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-2.5 py-1 rounded-full text-xs font-medium text-ktip-ocean-600 hover:underline"
          >
            <Trans>+{hiddenCount} more</Trans>
          </button>
        )}
      </div>
    </div>
  )
}
