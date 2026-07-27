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
    primary:
      'bg-gradient-to-r from-ktip-ocean-500 to-ktip-ocean-600 text-white shadow-soft hover:shadow-medium hover:-translate-y-0.5 disabled:from-ktip-ocean-300 disabled:to-ktip-ocean-400',
    secondary:
      'border border-ktip-sand-200 bg-white text-ktip-sand-700 hover:bg-ktip-sand-50 hover:border-ktip-sand-300',
    outline: 'border border-ktip-ocean-500 text-ktip-ocean-600 hover:bg-ktip-ocean-50',
    ghost: 'text-ktip-sand-600 hover:bg-ktip-sand-100',
    danger:
      'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-soft hover:shadow-medium hover:-translate-y-0.5',
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
