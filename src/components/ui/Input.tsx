import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: ReactNode
  fullWidth?: boolean
}

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
        <label htmlFor={inputId} className="text-sm font-medium text-ktip-sand-700">
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
            'w-full border rounded-xl px-4 py-3 bg-ktip-sand-50/50 transition-all',
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
        <p className={cn('text-sm', error ? 'text-red-500' : 'text-ktip-sand-500')}>
          {error || helperText}
        </p>
      )}
    </div>
  )
}
