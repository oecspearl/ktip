import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DropdownPanel } from './DropdownPanel'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

interface SelectProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  /** Trigger text when `value` matches no option. */
  placeholder?: string
  /** One of ariaLabel / ariaLabelledBy is required. */
  ariaLabel?: string
  ariaLabelledBy?: string
  disabled?: boolean
  /** Classes on the trigger button. */
  className?: string
  /** Classes on the popover — width or alignment overrides. */
  popoverClassName?: string
  /** Edge the popover aligns to. */
  align?: 'start' | 'end'
}

const TYPEAHEAD_RESET_MS = 500

/**
 * Filter-bar select. A native <select> draws its popup in the browser chrome,
 * which CSS cannot animate or theme — this is the same control as a listbox we
 * own, styled to match the inputs beside it.
 *
 * Filter bars only. Forms keep their native selects, which come with
 * validation, `name` and mobile pickers for free.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  ariaLabel,
  ariaLabelledBy,
  disabled,
  className,
  popoverClassName,
  align = 'start',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef({ buffer: '', timer: null as ReturnType<typeof setTimeout> | null })

  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  // Close on outside click — same shape as TagFilterSelect
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Focus goes to the list, not to an option: options stay unfocusable, so an
  // exiting panel never holds the focus ring
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => listRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    // jsdom has no scrollIntoView, and neither do very old engines
    const active = document.getElementById(optionId(activeIndex))
    active?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeIndex])

  useEffect(
    () => () => {
      if (typeahead.current.timer) clearTimeout(typeahead.current.timer)
    },
    []
  )

  const firstEnabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i
    }
    return -1
  }

  const openWith = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }

  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }

  const commit = (option: SelectOption<T>) => {
    if (option.disabled) return
    onChange(option.value)
    close()
  }

  /** Jump to the next option whose label starts with the buffered keys. */
  const runTypeahead = (key: string) => {
    const state = typeahead.current
    if (state.timer) clearTimeout(state.timer)
    state.buffer += key.toLowerCase()
    state.timer = setTimeout(() => {
      state.buffer = ''
      state.timer = null
    }, TYPEAHEAD_RESET_MS)

    // A repeated single character cycles through the options starting with it
    const term =
      state.buffer.length > 1 && state.buffer.split('').every((c) => c === state.buffer[0])
        ? state.buffer[0]
        : state.buffer

    const start = activeIndex >= 0 ? activeIndex + 1 : 0
    for (let step = 0; step < options.length; step += 1) {
      const index = (start + step) % options.length
      const option = options[index]
      if (!option.disabled && option.label.toLowerCase().startsWith(term)) {
        setActiveIndex(index)
        return
      }
    }
  }

  const move = (delta: number) => {
    const from = activeIndex >= 0 ? activeIndex : selectedIndex >= 0 ? selectedIndex : 0
    // Clamped, no wrap — that is how a native select behaves
    const target = Math.min(Math.max(from + delta, 0), options.length - 1)
    const next = firstEnabled(target, delta > 0 ? 1 : -1)
    if (next >= 0) setActiveIndex(next)
  }

  const onListKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'PageDown':
        event.preventDefault()
        move(10)
        break
      case 'PageUp':
        event.preventDefault()
        move(-10)
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(firstEnabled(0, 1))
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(firstEnabled(options.length - 1, -1))
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (activeIndex >= 0) commit(options[activeIndex])
        break
      case 'Escape':
        event.preventDefault()
        // Stop here, or the modal / navbar Escape handlers close too
        event.stopPropagation()
        close()
        break
      case 'Tab':
        close(false)
        break
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          runTypeahead(event.key)
        }
    }
  }

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    // Opening and transferring focus happen in separate React/browser turns.
    // Route keys through the listbox immediately so fast keyboard input does
    // not reopen the trigger or get lost before the focus effect runs.
    if (open) {
      onListKeyDown(event)
      return
    }
    switch (event.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        event.preventDefault()
        openWith(selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        openWith(selectedIndex >= 0 ? selectedIndex : firstEnabled(options.length - 1, -1))
        break
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          setOpen(true)
          runTypeahead(event.key)
        }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={() => (open ? close(false) : openWith(selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1)))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2 border border-ktip-sand-300 bg-ktip-cream rounded-lg text-sm text-left text-ktip-sand-800 transition-colors',
          'focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none',
          open && 'border-ktip-ocean-500 ring-2 ring-ktip-ocean-500/20',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <span className={cn('truncate', !selected && 'text-ktip-sand-500')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-ktip-sand-500 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      <DropdownPanel
        open={open}
        className={cn(
          'absolute top-full z-30 mt-1 min-w-full w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-ktip-line bg-ktip-cream py-1 shadow-medium',
          align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
          popoverClassName
        )}
      >
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          onKeyDown={onListKeyDown}
          className="max-h-60 overflow-y-auto focus:outline-none"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => commit(option)}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                index === activeIndex ? 'bg-ktip-sand-100 text-ktip-sand-900' : 'text-ktip-sand-700',
                option.value === value && 'font-semibold text-ktip-ocean-700',
                option.disabled && 'cursor-not-allowed opacity-40'
              )}
            >
              <Check size={12} className={cn('shrink-0', option.value !== value && 'invisible')} />
              <span className="truncate">{option.label}</span>
            </li>
          ))}
        </ul>
      </DropdownPanel>
    </div>
  )
}
