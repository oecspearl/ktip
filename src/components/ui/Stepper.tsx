import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Trans } from '@lingui/react/macro'

/**
 * A flat bar pointed at the right end and notched by the same amount at the
 * left, so consecutive segments nest into each other instead of sitting there
 * as N unrelated dashes. Tip and notch are the same 5px: any longer and a
 * thin 6px bar reads as a dart rather than an arrow.
 *
 * A clip rather than a border trick or a separate glyph, so it stays one
 * element that state can recolour with a plain colour transition.
 */
const ARROW_CLIP =
  'polygon(0 0, calc(100% - 5px) 0, 100% 50%, calc(100% - 5px) 100%, 0 100%, 5px 50%)'

/** The first segment has nothing to nest into, so it keeps a flat back. */
const ARROW_CLIP_FIRST = 'polygon(0 0, calc(100% - 5px) 0, 100% 50%, calc(100% - 5px) 100%, 0 100%)'

export interface StepperStep {
  label: string
  /** Small line under the label — a date, a status, whatever the caller has */
  sublabel?: string
}

interface StepperProps {
  /** Plain strings when there is nothing under the label */
  steps: (string | StepperStep)[]
  /** 0-indexed. Everything before it reads as done, everything after as pending */
  currentStep: number
  /** Only ever fires for a step already completed — you cannot skip ahead */
  onStepClick?: (step: number) => void
  /** `compact` drops the circles and labels, leaving the segment bars alone */
  variant?: 'default' | 'compact'
  /**
   * How the run ended. `complete` marks the current step done rather than in
   * progress; `rejected` paints it red. Omit while the flow is still moving.
   */
  terminal?: 'complete' | 'rejected'
  /** Light-on-dark, for a stepper sitting over a photo */
  onPhoto?: boolean
  className?: string
}

type StepState = 'complete' | 'current' | 'pending' | 'rejected'

/**
 * The one progress stepper. A segment bar per step with the circle and label
 * beneath it, rather than circles strung along a single connector line — the
 * bar is what carries the progress, so it stays legible once the labels drop
 * away on a narrow screen. Each bar is arrow-tipped, pointing at the step that
 * comes next.
 *
 * Every multi-step flow in the app uses this: the grant application, the
 * dashboard timeline, signup/onboarding (as `compact`), and event creation.
 * It was three near-identical copies before.
 */
export function Stepper({
  steps,
  currentStep,
  onStepClick,
  variant = 'default',
  terminal,
  onPhoto = false,
  className,
}: StepperProps) {
  const normalized: StepperStep[] = steps.map((s) =>
    typeof s === 'string' ? { label: s } : s
  )

  const stateOf = (i: number): StepState => {
    if (i < currentStep) return 'complete'
    if (i > currentStep) return 'pending'
    if (terminal === 'rejected') return 'rejected'
    if (terminal === 'complete') return 'complete'
    return 'current'
  }

  return (
    // gap-1 rather than the usual gap-3: the tip has to sit close enough to
    // the next notch to read as nesting into it.
    <ol className={cn('flex w-full items-start gap-1', className)}>
      {normalized.map((step, i) => {
        const state = stateOf(i)
        const reached = state !== 'pending'
        const isClickable = !!onStepClick && i < currentStep

        const bar = (
          <span
            aria-hidden="true"
            style={{ clipPath: i === 0 ? ARROW_CLIP_FIRST : ARROW_CLIP }}
            className={cn(
              'block h-1.5 w-full transition-colors',
              state === 'rejected' && 'bg-red-500',
              state !== 'rejected' &&
                reached &&
                (onPhoto ? 'bg-brand-white' : 'bg-ktip-ocean-600 dark:bg-ktip-ocean-200'),
              !reached && (onPhoto ? 'bg-brand-white/30' : 'bg-ktip-sand-200')
            )}
          />
        )

        return (
          <li
            key={`${step.label}-${i}`}
            className="flex min-w-0 flex-1 items-start gap-1.5"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {variant === 'compact' ? (
              <div className="min-w-0 flex-1">{bar}</div>
            ) : (
              <button
                type="button"
                onClick={() => isClickable && onStepClick?.(i)}
                disabled={!isClickable}
                className={cn(
                  'group block min-w-0 flex-1 text-left',
                  isClickable ? 'cursor-pointer' : 'cursor-default'
                )}
              >
                {bar}
                <span className="mt-2.5 flex items-center gap-2">
                  <StepCircle state={state} index={i} clickable={isClickable} />
                  <span className="hidden min-w-0 flex-1 sm:block">
                    <span
                      className={cn(
                        'block truncate text-xs transition-colors',
                        state === 'rejected' && 'font-medium text-red-600',
                        state === 'current' && 'font-semibold text-ktip-sand-900',
                        state === 'complete' && 'font-medium text-ktip-sand-800',
                        state === 'pending' && 'font-medium text-ktip-sand-400',
                        isClickable && 'group-hover:text-ktip-ocean-600'
                      )}
                    >
                      {step.label}
                    </span>
                    {step.sublabel && (
                      <span className="mt-0.5 block truncate text-[10px] text-ktip-sand-400">
                        {step.sublabel}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StepCircle({
  state,
  index,
  clickable,
}: {
  state: StepState
  index: number
  clickable: boolean
}) {
  const base =
    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors'
  // Hoisted so the catalog entry reads `Step {stepNumber} not started` rather
  // than `Step {0} not started`, which a translator cannot interpret.
  const stepNumber = index + 1

  if (state === 'rejected') {
    return (
      <span className={cn(base, 'bg-red-500 text-white')}>
        <X size={11} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }

  if (state === 'complete') {
    return (
      <span
        className={cn(
          base,
          'bg-ktip-ocean-600 text-white dark:bg-ktip-ocean-200',
          clickable && 'group-hover:bg-ktip-ocean-500'
        )}
      >
        <Check size={11} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }

  if (state === 'current') {
    // Radio-style: ring plus a filled centre, so "here" reads differently from
    // "done" at a glance and not only by colour.
    return (
      <span
        className={cn(base, 'border-2 border-ktip-ocean-600 dark:border-ktip-ocean-200')}
      >
        <span className="h-2 w-2 rounded-full bg-ktip-ocean-600 dark:bg-ktip-ocean-200" />
      </span>
    )
  }

  return (
    <span className={cn(base, 'border-2 border-ktip-sand-300')}>
      <span className="sr-only">
        <Trans>Step {stepNumber} not started</Trans>
      </span>
    </span>
  )
}
