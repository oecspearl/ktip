import { For } from 'solid-js'
import { Check } from 'lucide-solid'

interface StepperProps {
  steps: string[]
  currentStep: number
  onStepClick?: (step: number) => void
}

export function Stepper(props: StepperProps) {
  return (
    <div class="flex items-center w-full overflow-x-auto pb-2">
      <For each={props.steps}>
        {(label, index) => {
          const i = index()
          const isCompleted = i < props.currentStep
          const isCurrent = i === props.currentStep
          const isClickable = props.onStepClick && i < props.currentStep

          return (
            <div class="flex items-center flex-shrink-0" classList={{ 'flex-1': i < props.steps.length - 1 }}>
              {/* Step circle + label */}
              <button
                type="button"
                onClick={() => isClickable && props.onStepClick?.(i)}
                disabled={!isClickable}
                class="flex flex-col items-center gap-1.5 group"
                classList={{ 'cursor-pointer': !!isClickable, 'cursor-default': !isClickable }}
              >
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all"
                  classList={{
                    'bg-ktip-ocean-500 border-ktip-ocean-500 text-white': isCompleted,
                    'bg-ktip-ocean-500 border-ktip-ocean-500 text-white ring-4 ring-ktip-ocean-100': isCurrent,
                    'bg-white border-ktip-sand-300 text-ktip-sand-400': !isCompleted && !isCurrent,
                    'group-hover:border-ktip-ocean-400': !!isClickable,
                  }}
                >
                  {isCompleted ? <Check size={16} /> : i + 1}
                </div>
                <span
                  class="text-xs font-medium text-center whitespace-nowrap max-w-[80px] truncate hidden sm:block"
                  classList={{
                    'text-ktip-ocean-600': isCompleted || isCurrent,
                    'text-ktip-sand-400': !isCompleted && !isCurrent,
                  }}
                >
                  {label}
                </span>
              </button>

              {/* Connector line */}
              {i < props.steps.length - 1 && (
                <div
                  class="flex-1 h-0.5 mx-2 min-w-[20px] transition-colors"
                  classList={{
                    'bg-ktip-ocean-500': isCompleted,
                    'bg-ktip-sand-200': !isCompleted,
                  }}
                />
              )}
            </div>
          )
        }}
      </For>
    </div>
  )
}
