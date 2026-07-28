import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({ className, hover, padding, children, ...others }: CardProps) {
  const paddingStyles = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  return (
    <div
      className={cn(
        'bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100',
        hover && 'hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 cursor-pointer',
        paddingStyles[padding || 'md'],
        className
      )}
      {...others}
    >
      {children}
    </div>
  )
}
