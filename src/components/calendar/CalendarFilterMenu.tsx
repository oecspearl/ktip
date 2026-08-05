import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DropdownPanel } from '../ui/DropdownPanel'
import { CALENDAR_KIND_DOT_COLORS, CALENDAR_KIND_LABELS } from '../../lib/constants'
import type { CalendarItemKind } from '../../lib/calendar'
import { Trans, useLingui } from '@lingui/react/macro'

interface CalendarFilterMenuProps {
  kinds: CalendarItemKind[]
  active: CalendarItemKind[]
  onToggle: (kind: CalendarItemKind) => void
  /** Omitted on the platform calendar, where there is no "mine" to filter to */
  onlyMine?: boolean
  onOnlyMineChange?: (next: boolean) => void
}

/** One row of the menu — a checkbox that is the whole row, not a box beside one. */
function CheckRow({
  checked,
  onChange,
  children,
  swatch,
}: {
  checked: boolean
  onChange: () => void
  children: React.ReactNode
  swatch?: string
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-center gap-2.5 rounded-neu-sm px-2 py-1.5 text-left text-sm transition-all hover:text-ktip-ocean-700 hover:shadow-neu-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[0.25rem] border transition-colors',
          checked
            ? 'border-ktip-ocean-600 bg-ktip-ocean-600 text-white'
            : 'border-ktip-sand-300 bg-ktip-cream'
        )}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      {swatch && <span aria-hidden="true" className={cn('h-3.5 w-[3px] rounded-full', swatch)} />}
      <span className="min-w-0 truncate text-ktip-sand-700">{children}</span>
    </button>
  )
}

/**
 * What the calendar shows, behind one trigger.
 *
 * Replaces the row of filter pills plus the separate Whose switch. Both were
 * doing the same job — narrowing the feed — and spending a full toolbar line
 * on it pushed the grid down the page. "Only my items" is a checkbox here
 * rather than its own control for the same reason.
 */
export function CalendarFilterMenu({
  kinds,
  active,
  onToggle,
  onlyMine,
  onOnlyMineChange,
}: CalendarFilterMenuProps) {
  const { t, i18n } = useLingui()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hidden = kinds.length - active.length
  // Naming what is missing rather than what is on: "all item types" is the
  // resting state, and a count only earns the label once something is off
  const summary = hidden === 0 ? t`All item types` : t`${active.length} of ${kinds.length} types`

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-caption font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
          open || hidden > 0 || onlyMine
            ? 'text-ktip-ocean-700 shadow-neu-sm-inset'
            : 'text-ktip-sand-600 hover:text-ktip-ocean-700 hover:shadow-neu-sm'
        )}
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        {summary}
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      <DropdownPanel
        open={open}
        role="menu"
        aria-label={t`Calendar filters`}
        className="neu-surface absolute left-0 top-full z-dropdown mt-1 w-60 rounded-surface border border-ktip-sand-200 bg-ktip-cream p-2 shadow-medium"
      >
        <p className="px-2 pb-1 pt-0.5 text-micro font-bold uppercase tracking-wider text-ktip-sand-500">
          <Trans>Show</Trans>
        </p>
        {kinds.map((kind) => (
          <CheckRow
            key={kind}
            checked={active.includes(kind)}
            onChange={() => onToggle(kind)}
            swatch={CALENDAR_KIND_DOT_COLORS[kind]}
          >
            {i18n._(CALENDAR_KIND_LABELS[kind])}
          </CheckRow>
        ))}

        {onOnlyMineChange && (
          <>
            <div aria-hidden="true" className="my-1.5 h-px bg-ktip-sand-200" />
            <CheckRow checked={!!onlyMine} onChange={() => onOnlyMineChange(!onlyMine)}>
              <Trans>Only my items</Trans>
            </CheckRow>
          </>
        )}
      </DropdownPanel>
    </div>
  )
}
