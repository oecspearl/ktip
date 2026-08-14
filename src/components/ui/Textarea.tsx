import { useId, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
  fullWidth?: boolean
}

/**
 * Every metric that decides where a character lands: typography, box and
 * wrapping. Exported because the content filter's strikethrough draws a mirror
 * copy of this text behind the field, and the two must agree to the pixel — a
 * mismatch is invisible in a three-line test and obvious forty lines into a
 * grant proposal. One string, consumed by both, cannot drift.
 *
 * resize-none is load-bearing here: a user-resizable textarea would need the
 * mirror re-measured on every drag.
 */
export const TEXTAREA_SURFACE_CLASSES =
  'w-full border rounded-control px-4 py-3 text-body resize-none whitespace-pre-wrap break-words'

export function Textarea({
  className,
  label,
  error,
  helperText,
  fullWidth,
  id,
  ...others
}: TextareaProps) {
  const generatedId = useId()
  const textareaId = id || generatedId

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      {label && (
        <label htmlFor={textareaId} className="text-label font-medium text-ktip-sand-700">
          {label}
        </label>
      )}

      <textarea
        id={textareaId}
        className={cn(
          TEXTAREA_SURFACE_CLASSES,
          'bg-ktip-sand-50/50 transition-all',
          'focus:outline-none focus:ring-2 focus:bg-ktip-cream',
          error
            ? 'border-red-400/70 bg-red-50/30 focus:border-red-400 focus:ring-red-400/15'
            : 'border-ktip-sand-200 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20',
          className
        )}
        {...others}
      />

      {(error || helperText) && (
        <p className={cn('text-caption', error ? 'text-red-500' : 'text-ktip-sand-500')}>
          {error || helperText}
        </p>
      )}
    </div>
  )
}
