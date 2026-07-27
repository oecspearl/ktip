import { type JSX, splitProps } from 'solid-js'
import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
type BadgeSize = 'sm' | 'md' | 'lg'

interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
}

export function Badge(props: BadgeProps) {
  const [local, others] = splitProps(props, ['class', 'variant', 'size', 'children'])

  const variantStyles = {
    default: 'bg-ktip-sand-100 text-ktip-sand-700 border-ktip-sand-200',
    primary: 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200',
    success: 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    danger: 'bg-red-100 text-red-700 border-red-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
  }

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  }

  return (
    <span
      class={cn(
        'inline-flex items-center gap-1 rounded-full font-medium border',
        variantStyles[local.variant || 'default'],
        sizeStyles[local.size || 'md'],
        local.class
      )}
      {...others}
    >
      {local.children}
    </span>
  )
}
