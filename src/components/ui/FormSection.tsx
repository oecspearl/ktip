import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useDisclosureAnimation } from './useDisclosureAnimation'

interface FormSectionProps {
  title: string
  /**
   * One line shown under the title while the section is folded — the answers
   * it holds, so the reader can check them without opening it. Ignored while
   * open.
   */
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  /** Draws a tick in the header. Set once everything inside is valid. */
  complete?: boolean
  children: ReactNode
  className?: string
}

/**
 * A fold-away group of form fields with a header that stays put.
 *
 * Controlled, unlike CollapsibleSection: a form decides for itself when a
 * section is finished with and the next one should come forward, so the open
 * state belongs to the form, not the section. The header is a button, so the
 * reader can always reopen a folded section to change an answer.
 *
 * Children stay mounted while folded — their values are the form's state and
 * unmounting would not lose them, but remounting would replay every entrance
 * and reset scroll — and the wrapper is `inert` while folded so Tab does not
 * walk through fields nobody can see.
 */
export function FormSection({
  title,
  summary,
  open,
  onToggle,
  complete = false,
  children,
  className,
}: FormSectionProps) {
  const { state, settled } = useDisclosureAnimation(open, { keepMounted: true })

  return (
    <section
      className={cn(
        'rounded-2xl border transition-colors duration-200',
        open ? 'border-ktip-sand-200 bg-ktip-cream' : 'border-ktip-sand-200/80 bg-ktip-sand-50/60',
        className
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-ktip-sand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500/30"
      >
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-200',
            complete
              ? 'border-ktip-tropical-500 bg-ktip-tropical-500 text-white'
              : 'border-ktip-sand-300 text-ktip-sand-400'
          )}
          aria-hidden="true"
        >
          {complete ? <Check size={14} strokeWidth={3} /> : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ktip-sand-900">{title}</span>
          {!open && summary && (
            <span className="mt-0.5 block truncate text-xs text-ktip-sand-500">{summary}</span>
          )}
        </span>

        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-ktip-sand-500 transition-transform duration-200',
            open ? 'rotate-180' : 'rotate-0'
          )}
        />
      </button>

      <div className="disclosure-collapse" data-state={state} data-settled={settled}>
        <div inert={!open}>
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </section>
  )
}
