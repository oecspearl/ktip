import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

interface StepperProps {
  steps: string[]
  currentStep: number
  onStepClick?: (step: number) => void
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div className="flex items-center w-full overflow-x-auto pb-2">
      {steps.map((label, i) => {
        const isCompleted = i < currentStep
        const isCurrent = i === currentStep
        const isClickable = !!onStepClick && i < currentStep

        return (
          <div key={i} className={cn('flex items-center flex-shrink-0', i < steps.length - 1 && 'flex-1')}>
            {/* Step circle + label */}
            <button
              type="button"
              onClick={() => isClickable && onStepClick?.(i)}
              disabled={!isClickable}
              className={cn('flex flex-col items-center gap-1.5 group', isClickable ? 'cursor-pointer' : 'cursor-default')}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all',
                  isCompleted && 'bg-ktip-ocean-500 border-ktip-ocean-500 text-white',
                  isCurrent && 'bg-ktip-ocean-500 border-ktip-ocean-500 text-white ring-4 ring-ktip-ocean-100',
                  !isCompleted && !isCurrent && 'bg-white border-ktip-sand-300 text-ktip-sand-400',
                  isClickable && 'group-hover:border-ktip-ocean-400'
                )}
              >
                {isCompleted ? <Check size={16} /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium text-center whitespace-nowrap max-w-[80px] truncate hidden sm:block',
                  isCompleted || isCurrent ? 'text-ktip-ocean-600' : 'text-ktip-sand-400'
                )}
              >
                {label}
              </span>
            </button>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2 min-w-[20px] transition-colors',
                  isCompleted ? 'bg-ktip-ocean-500' : 'bg-ktip-sand-200'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
