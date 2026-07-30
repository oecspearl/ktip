import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useDisclosureAnimation } from './useDisclosureAnimation'

interface CollapsibleSectionProps {
  title: string
  /** Rendered as a pill next to the title. Omit to hide. */
  count?: number
  subtitle?: string
  /** Small icon rendered before the title. */
  icon?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/**
 * Headed section that folds away. Used for the tail ends of listing pages —
 * closed grants, past events — where the content still belongs on the page but
 * should not compete with what is open.
 */
export function CollapsibleSection({
  title,
  count,
  subtitle,
  icon,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  // Children stay mounted; the grid-rows transition does the folding
  const { state, settled } = useDisclosureAnimation(open, { keepMounted: true })

  return (
    <section className={cn('border-t border-ktip-sand-200 pt-4', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left group mb-4"
      >
        <ChevronDown
          size={18}
          className={cn(
            'text-ktip-sand-500 transition-transform duration-200 shrink-0',
            open ? 'rotate-0' : '-rotate-90'
          )}
        />
        {icon}
        <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider group-hover:text-ktip-ocean-600 transition-colors">
          {title}
        </h3>
        {count !== undefined && (
          <span className="text-xs bg-ktip-sand-100 text-ktip-sand-600 px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
        {subtitle && <span className="text-xs italic text-ktip-ocean-600">{subtitle}</span>}
      </button>

      <div className="disclosure-collapse" data-state={state} data-settled={settled}>
        <div>
          <div className="mb-8">{children}</div>
        </div>
      </div>
    </section>
  )
}
