import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

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
  label = 'Tags',
}: TagFilterChipsProps) {
  const [expanded, setExpanded] = useState(false)

  if (options.length === 0) return null

  // Selected tags stay visible even when they sit past the collapse cutoff.
  const visible = expanded
    ? options
    : [...new Set([...options.slice(0, collapsedCount), ...selected.filter((t) => options.includes(t))])]

  const toggle = (tag: string) =>
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag])

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
          {label}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 text-xs text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:underline transition-colors"
          >
            <X size={11} />
            Clear
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
            +{options.length - visible.length} more
          </button>
        )}
      </div>
    </div>
  )
}
