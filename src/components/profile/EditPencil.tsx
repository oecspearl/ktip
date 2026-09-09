import type { ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'

export interface EditPencilProps {
  /**
   * The block's name, already translated. The button is named "Edit {label}",
   * because "Edit" nine times in a row is nine controls a screen reader
   * cannot tell apart.
   */
  label: string
  onClick: () => void
  /**
   * `rail`   — on a cream card. Hidden until reached for from `md` up.
   * `onDark` — over hero photography, where there is no surface to sculpt out
   *            of: frosted glass, always visible.
   */
  tone?: 'rail' | 'onDark'
  className?: string
}

/**
 * The affordance that turns a profile block into an editable one.
 *
 * Deliberately not revealed on hover below `md`: a phone has no pointer to
 * hover with, so a hidden-until-hover control is a control that does not
 * exist there. It stays in the tab order at `opacity-0` — opacity removes
 * neither hit-testing nor focusability — and `group-focus-within` brings it
 * up when a keyboard reaches it.
 */
export function EditPencil({ label, onClick, tone = 'rail', className }: EditPencilProps) {
  const { t } = useLingui()
  const name = t`Edit ${label}`

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      title={name}
      className={cn(
        // A button, so rounded-neu-* is the right radius here — the one place
        // it is. Idle flat, lifting on hover: the house language for a control
        // that is available rather than active.
        'inline-flex shrink-0 items-center justify-center rounded-neu-sm transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
        tone === 'onDark'
          ? 'neu-on-dark border border-white/30 bg-white/10 p-2.5 text-white backdrop-blur-sm hover:bg-white/20'
          : cn(
              'p-1.5 text-ktip-sand-500 hover:-translate-y-px hover:shadow-neu-sm hover:text-ktip-ocean-700',
              'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100'
            ),
        className
      )}
    >
      <Pencil size={tone === 'onDark' ? 16 : 14} aria-hidden="true" />
    </button>
  )
}

export interface EditableBlockProps {
  label: string
  /**
   * Absent and the children render untouched — no wrapper element, no pencil,
   * no class. That guarantee is what lets one component serve both the public
   * member page and the member's own editor: with no edit handler the DOM is
   * the DOM the page has always rendered.
   */
  onEdit?: () => void
  align?: 'top-right' | 'bottom-right'
  tone?: EditPencilProps['tone']
  className?: string
  children: ReactNode
}

/**
 * A pencil floated over a block that has nowhere to put one.
 *
 * Most blocks do not need this: `ProfileSection` already has an `actions` slot
 * in its heading, which puts the control in DOM order right after the title
 * and disturbs no layout. This is for the three that are not sections — the
 * banner, the portrait and the identity plate.
 */
export function EditableBlock({
  label,
  onEdit,
  align = 'top-right',
  tone = 'rail',
  className,
  children,
}: EditableBlockProps) {
  if (!onEdit) return <>{children}</>

  return (
    <div className={cn('group relative', className)}>
      {children}
      {/* No z-index: the pencil is a later sibling of the content it sits on,
          and paint order is enough. The design ratchet counts hand-picked z
          values and is at its ceiling. */}
      <EditPencil
        label={label}
        onClick={onEdit}
        tone={tone}
        className={cn('absolute right-3', align === 'top-right' ? 'top-3' : 'bottom-3')}
      />
    </div>
  )
}
