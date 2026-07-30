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
    // Mode-distinct brand pairs (brand-navy/-green are fixed Pantone tokens):
    // light — navy fill, white text, hover flips to green fill + navy text;
    // dark — green fill, navy text, hover inverts to navy fill + green text.
    // Shadow depth matches the homepage hero CTA: raised at rest (medium),
    // lifting to hard on hover, rather than the flatter soft→medium pair.
    primary:
      'bg-brand-navy text-white shadow-medium hover:bg-brand-green hover:text-brand-navy hover:shadow-hard disabled:bg-ktip-ocean-400 disabled:hover:text-white dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-navy dark:hover:text-brand-green dark:hover:shadow-glow-tropical dark:disabled:hover:text-brand-navy',
    secondary:
      'border border-ktip-sand-200 bg-ktip-cream text-ktip-sand-700 shadow-medium hover:bg-ktip-sand-50 hover:border-ktip-sand-300 hover:shadow-hard',
    outline:
      'border border-ktip-ocean-500 text-ktip-ocean-600 shadow-medium hover:bg-ktip-ocean-50 hover:shadow-hard',
    ghost: 'text-ktip-sand-600 hover:bg-ktip-sand-100',
    danger:
      'bg-red-600 text-white shadow-medium hover:bg-red-700 hover:shadow-hard dark:bg-red-500 dark:hover:bg-red-400',
  }

  const sizeStyles = {
    sm: 'px-4 py-2 text-sm rounded-lg',
    md: 'px-6 py-3 text-base rounded-xl',
    lg: 'px-8 py-4 text-lg rounded-xl',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100',
        variantStyles[variant || 'primary'],
        sizeStyles[size || 'md'],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...others}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
      )}
      {!loading && icon}
      {children}
    </button>
  )
}
