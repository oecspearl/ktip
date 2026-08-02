import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
}

export function Badge({ className, variant, size, children, ...others }: BadgeProps) {
  const variantStyles = {
    default: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
    primary: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
    success: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
    warning: 'bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200',
    danger: 'bg-red-100 text-red-700 border-red-200',
    info: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
  }

  // A badge is the densest text in the app, so `sm` sets the floor: 13px, not
  // the 12px text-xs used to sit at. Below that it stops being readable at a
  // glance, which is the only thing a badge is for.
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-micro',
    md: 'px-3 py-1 text-caption',
    lg: 'px-4 py-1.5 text-body',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-control font-medium border',
        variantStyles[variant || 'default'],
        sizeStyles[size || 'md'],
        className
      )}
      {...others}
    >
      {children}
    </span>
  )
}
