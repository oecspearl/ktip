import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useLingui } from '@lingui/react/macro'

interface CollapsibleSearchProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  ariaLabel?: string
  /** Controlled open state. Omit to let the component own it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

/**
 * Search that lives as an icon in a filter row and expands in place, the same
 * gesture as the navbar. Collapses on outside click or Escape, but only while
 * empty — folding a live query out of sight would hide why the list is short.
 */
export function CollapsibleSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
  open: openProp,
  onOpenChange,
  className,
}: CollapsibleSearchProps) {
  const { t } = useLingui()
  // Destructuring defaults run before the body, where `t` does not exist yet.
  const placeholderText = placeholder ?? t`Search...`
  const label = ariaLabel ?? t`Search`
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        // Clicks on the walkthrough card are not "outside" — collapsing the
        // search out from under the step describing it would be absurd
        if ((e.target as Element).closest?.('[data-tutorial-overlay]')) return
        if (!inputRef.current?.value) setOpen(false)
      }
    }
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className={cn('flex items-center justify-end', className)}>
      <div
        className={cn(
          'relative overflow-hidden transition-[width] duration-300 ease-out',
          open ? 'w-48 sm:w-64' : 'w-10'
        )}
      >
        {open ? (
          <>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholderText}
              aria-label={label}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-ktip-sand-300 bg-ktip-cream rounded-lg focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors text-sm"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t`Open ${label}`}
            className={cn(
              'p-2 rounded-lg transition-all duration-200 hover:bg-ktip-sand-100 hover:scale-110',
              value ? 'text-ktip-ocean-600' : 'text-ktip-sand-700'
            )}
          >
            <Search size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
