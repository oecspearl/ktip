import { useEffect, useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import { OTP_LENGTH, sanitiseOtp } from '../../lib/mfa'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  /** Fired once when the field fills. The parent does not need to watch length. */
  onComplete?: (value: string) => void
  label: string
  error?: string
  helperText?: string
  disabled?: boolean
  autoFocus?: boolean
  length?: number
}

/**
 * The six-digit field, shared by the signup email code, the enrolment check and
 * the sign-in challenge (118).
 *
 * One <input> behind a row of styled cells rather than N inputs. Six separate
 * boxes are the common pattern and they break paste, break autofill, and give a
 * screen reader six unlabelled fields to read out. A single input keeps
 * `autoComplete="one-time-code"` working — which is what lets iOS Safari offer
 * the code straight from the Mail notification — and the cells are decoration
 * drawn over it.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  label,
  error,
  helperText,
  disabled,
  autoFocus,
  length = OTP_LENGTH,
}: OtpInputProps) {
  const { t } = useLingui()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // Guards the auto-submit. Without it, any re-render while the field is full
  // fires onComplete again — and the parent is usually a mutation.
  const completedFor = useRef<string | null>(null)

  useEffect(() => {
    if (value.length < length) {
      completedFor.current = null
      return
    }
    if (completedFor.current === value) return
    completedFor.current = value
    onComplete?.(value)
  }, [value, length, onComplete])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    // Codes arrive from email as "123456" but also as "Your code is 123 456".
    event.preventDefault()
    onChange(sanitiseOtp(event.clipboardData.getData('text'), length))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // The caret is invisible, so Home/End/arrows would move it somewhere the
    // member cannot see and the next digit would land mid-code.
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
    }
  }

  const cells = Array.from({ length }, (_, index) => index)
  const focusedIndex = Math.min(value.length, length - 1)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-label font-medium text-ktip-sand-700">
        {label}
      </label>

      <div
        className="relative"
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={length}
          disabled={disabled}
          value={value}
          aria-invalid={!!error}
          aria-describedby={error || helperText ? `${inputId}-hint` : undefined}
          onChange={(event) => onChange(sanitiseOtp(event.target.value, length))}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          // Transparent and stretched across the cells: the real field for
          // keyboards, autofill and assistive tech, invisible to everyone else.
          className="absolute inset-0 w-full h-full opacity-0 cursor-default"
        />

        <div aria-hidden="true" className="flex gap-2 justify-between">
          {cells.map((index) => (
            <div
              key={index}
              className={cn(
                'flex-1 min-w-0 aspect-[3/4] max-h-14 rounded-control border flex items-center justify-center',
                'text-h4 font-semibold tabular-nums transition-all',
                error
                  ? 'border-red-400/70 bg-red-50/30 text-red-600'
                  : 'border-ktip-sand-200 bg-ktip-sand-50/50 text-ktip-sand-800',
                !disabled && !error && index === focusedIndex && value.length < length &&
                  'border-ktip-ocean-500 ring-2 ring-ktip-ocean-500/20 bg-ktip-cream',
                disabled && 'opacity-60',
              )}
            >
              {value[index] ?? ''}
            </div>
          ))}
        </div>
      </div>

      <p
        id={`${inputId}-hint`}
        className={cn('text-caption', error ? 'text-red-500' : 'text-ktip-sand-500')}
      >
        {error || helperText || t`Enter the ${length}-digit code`}
      </p>
    </div>
  )
}
