import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  className,
  variant,
  size,
  loading,
  icon,
  fullWidth,
  children,
  disabled,
  ...others
}: ButtonProps) {
  const variantStyles = {
    // Navy primary; ocean-700 inverts to a light tint in dark mode, so pin
    // an interactive mid navy there via dark:
    primary:
      'bg-ktip-ocean-700 text-white shadow-soft hover:bg-ktip-ocean-600 hover:shadow-medium hover:-translate-y-0.5 disabled:bg-ktip-ocean-400 dark:bg-ktip-ocean-300 dark:hover:bg-ktip-ocean-400 dark:disabled:bg-ktip-ocean-200',
    secondary:
      'border border-ktip-sand-200 bg-ktip-cream text-ktip-sand-700 hover:bg-ktip-sand-50 hover:border-ktip-sand-300',
    outline: 'border border-ktip-ocean-500 text-ktip-ocean-600 hover:bg-ktip-ocean-50',
    ghost: 'text-ktip-sand-600 hover:bg-ktip-sand-100',
    danger:
      'bg-red-600 text-white shadow-soft hover:bg-red-700 hover:shadow-medium hover:-translate-y-0.5 dark:bg-red-500 dark:hover:bg-red-400',
  }

  const sizeStyles = {
    sm: 'px-4 py-2 text-sm rounded-lg',
    md: 'px-6 py-3 text-base rounded-xl',
    lg: 'px-8 py-4 text-lg rounded-xl',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant || 'primary'],
        sizeStyles[size || 'md'],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...others}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
      )}
      {!loading && icon}
      {children}
    </button>
  )
}
