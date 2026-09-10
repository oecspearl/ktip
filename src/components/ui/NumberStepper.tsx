import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'

export interface NumberStepperProps {
  icon: ReactNode
  label: string
  value: string
  onDecrease: () => void
  onIncrease: () => void
  atMin: boolean
  atMax: boolean
  /** px size for the +/− glyphs, scaled by the caller off its own factor */
  iconSize: number
}

/**
 * One labelled −/value/+ row. Sized in `em` so it follows whatever font-size
 * its host sets (the FAB scales itself; Settings does not). Not a progress
 * stepper — that one lives in `ui/Stepper.tsx`.
 */
export function NumberStepper({
  icon,
  label,
  value,
  onDecrease,
  onIncrease,
  atMin,
  atMax,
  iconSize,
}: NumberStepperProps) {
  const { t } = useLingui()
  const button =
    'w-[1.75em] h-[1.75em] rounded-[0.375em] flex items-center justify-center border border-ktip-sand-200 text-ktip-sand-700 hover:bg-ktip-sand-50 hover:text-ktip-ocean-600 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ktip-sand-700 transition-colors'

  return (
    <div className="mt-[0.75em] first:mt-0">
      <div className="flex items-center gap-[0.375em] text-[0.75em] text-ktip-sand-600 mb-[0.375em]">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-[0.5em]">
        <button type="button" onClick={onDecrease} disabled={atMin} aria-label={t`Decrease ${label}`} className={button}>
          <Minus size={iconSize} />
        </button>
        {/* tabular-nums so the row does not reflow as the number changes */}
        <span className="flex-1 text-center text-[0.8125em] font-medium tabular-nums text-ktip-sand-900">
          {value}
        </span>
        <button type="button" onClick={onIncrease} disabled={atMax} aria-label={t`Increase ${label}`} className={button}>
          <Plus size={iconSize} />
        </button>
      </div>
    </div>
  )
}
