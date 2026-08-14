import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: ReactNode
  fullWidth?: boolean
}

/**
 * The single-line counterpart to TEXTAREA_SURFACE_CLASSES — see that comment.
 * white-space is `pre` rather than `pre-wrap`: an input never wraps, it scrolls
 * horizontally, and a wrapping mirror would misplace every mark past the fold.
 */
export const INPUT_SURFACE_CLASSES =
  'w-full border rounded-control px-4 py-3 min-h-control-md text-body whitespace-pre'

export function Input({
  className,
  label,
  error,
  helperText,
  icon,
  fullWidth,
  id,
  ...others
}: InputProps) {
  const generatedId = useId()
  const inputId = id || generatedId

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      {label && (
        <label htmlFor={inputId} className="text-label font-medium text-ktip-sand-700">
          {label}
        </label>
      )}

      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400">
            {icon}
          </div>
        )}

        <input
          id={inputId}
          className={cn(
            // text-body is stated rather than inherited so the field tracks the
            // reading ramp; an unsized input silently kept the browser default.
            INPUT_SURFACE_CLASSES,
            'bg-ktip-sand-50/50 transition-all',
            'focus:outline-none focus:ring-2 focus:bg-ktip-cream',
            icon && 'pl-10',
            error
              ? 'border-red-400/70 bg-red-50/30 focus:border-red-400 focus:ring-red-400/15'
              : 'border-ktip-sand-200 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20',
            className
          )}
          {...others}
        />
      </div>

      {(error || helperText) && (
        <p className={cn('text-caption', error ? 'text-red-500' : 'text-ktip-sand-500')}>
          {error || helperText}
        </p>
      )}
    </div>
  )
}
