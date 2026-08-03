import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useGantt } from './gantt'
import { formatWindowLabel } from './gantt-scale'
import { SCALE_LABELS, SCALE_ORDER, SCALE_SPECS } from './gantt-types'
import { Trans, useLingui } from '@lingui/react/macro'

interface GanttNavProps {
  className?: string
  children?: ReactNode
}

/** Right-aligned slot for consumer actions. */
export function GanttToolbar({ className, children }: GanttNavProps) {
  return <div className={cn('ms-auto flex items-center gap-2', className)}>{children}</div>
}

function ScaleSwitcher() {
    const { t, i18n } = useLingui()
  const { scale, setScale } = useGantt()

  return (
    <div
      role="group"
      aria-label={t`Timeline scale`}
      className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-ktip-sand-100"
    >
      {SCALE_ORDER.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={scale === option}
          onClick={() => setScale(option)}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400',
            scale === option
              ? 'bg-ktip-cream text-ktip-sand-900 shadow-card'
              : 'text-ktip-sand-500 hover:text-ktip-sand-700'
          )}
        >
          {i18n._(SCALE_LABELS[option])}
        </button>
      ))}
    </div>
  )
}

export function GanttNav({ className, children }: GanttNavProps) {
  const { t } = useLingui()
  const { window: win, scale, goPrev, goNext, goToday } = useGantt()
  const unit = SCALE_SPECS[scale].windowUnit
  const label = formatWindowLabel(win, scale)
  const prevLabel =
    unit === 'week' ? t`Previous week` : unit === 'month' ? t`Previous month` : t`Previous quarter`
  const nextLabel =
    unit === 'week' ? t`Next week` : unit === 'month' ? t`Next month` : t`Next quarter`

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 px-3 py-2 border-b border-ktip-sand-100',
        className
      )}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={goPrev}
          aria-label={prevLabel}
          className="p-1.5 rounded-lg text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-ktip-sand-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={goToday}
          className="px-2.5 py-1 rounded-lg text-xs font-medium text-ktip-sand-600 hover:bg-ktip-sand-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400"
        >
          <Trans>Today</Trans>
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={nextLabel}
          className="p-1.5 rounded-lg text-ktip-sand-500 hover:bg-ktip-sand-100 hover:text-ktip-sand-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-400"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <span className="text-sm font-medium text-ktip-sand-900 truncate">{label}</span>
      {/* The visible label is decorative for AT once it is announced here. */}
      <span className="sr-only" aria-live="polite">
        <Trans>Showing {label}</Trans>
      </span>

      <div className="ms-auto flex items-center gap-2">
        <ScaleSwitcher />
        {children}
      </div>
    </div>
  )
}
