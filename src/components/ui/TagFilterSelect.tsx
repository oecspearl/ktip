import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Tag, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DropdownPanel } from './DropdownPanel'
import { Trans, useLingui } from '@lingui/react/macro'

interface TagFilterSelectProps {
  /** Full vocabulary, most common first — see useTagVocabulary. */
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  label?: string
  /** Show a filter box once the vocabulary passes this size. */
  searchThreshold?: number
  className?: string
}

/**
 * Multi-select tag filter as a single dropdown, so the filter row stays one
 * line instead of spilling a full chip rail under it. Renders nothing until
 * content is actually tagged.
 */
export function TagFilterSelect({
  options,
  selected,
  onChange,
  label,
  searchThreshold = 10,
  className,
}: TagFilterSelectProps) {
  const { t } = useLingui()
  // Destructuring defaults run before the body, where `t` does not exist yet.
  const heading = label ?? t`Tags`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape — there is no shared Popover primitive
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? options.filter((tag) => tag.toLowerCase().includes(term)) : options
  }, [options, query])

  if (options.length === 0) return null

  const toggle = (tag: string) =>
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag])

  const count = selected.length

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex items-center gap-2 px-3 py-2 border rounded-lg bg-ktip-cream text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500',
          count > 0 ? 'border-ktip-ocean-400 text-ktip-ocean-700' : 'border-ktip-sand-300 text-ktip-sand-700'
        )}
      >
        <Tag size={14} />
        {heading}
        {count > 0 && (
          <span className="rounded-full bg-ktip-ocean-600 dark:bg-ktip-ocean-200 px-1.5 text-[10px] font-bold leading-4 text-white">
            {count}
          </span>
        )}
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      <DropdownPanel
        open={open}
        className="absolute left-0 top-full z-dropdown mt-1 w-64 origin-top-left rounded-lg border border-ktip-line bg-ktip-cream p-2 shadow-medium"
      >
          {options.length > searchThreshold && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t`Filter ${heading}…`}
              aria-label={t`Filter ${heading}`}
              className="mb-2 w-full rounded-lg border border-ktip-sand-300 bg-ktip-canvas px-2.5 py-1.5 text-sm focus:border-ktip-ocean-500 focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20"
            />
          )}

          <div role="listbox" aria-multiselectable="true" className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-ktip-sand-500"><Trans>No matching tags</Trans></p>
            ) : (
              filtered.map((tag) => {
                const active = selected.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggle(tag)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      active
                        ? 'bg-ktip-ocean-50 text-ktip-ocean-700 font-semibold'
                        : 'text-ktip-sand-700 hover:bg-ktip-sand-100'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        active
                          ? 'border-ktip-ocean-600 bg-ktip-ocean-600 dark:bg-ktip-ocean-200 text-white'
                          : 'border-ktip-sand-300'
                      )}
                    >
                      {active && <Check size={11} />}
                    </span>
                    <span className="truncate">{tag}</span>
                  </button>
                )
              })
            )}
          </div>

          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border-t border-ktip-sand-200 pt-2 text-xs font-semibold text-ktip-ocean-600 hover:text-ktip-ocean-700"
            >
              <X size={11} />
              <Trans>Clear {count} selected</Trans>
            </button>
          )}
      </DropdownPanel>
    </div>
  )
}
