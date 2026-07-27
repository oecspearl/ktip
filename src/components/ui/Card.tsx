import { type JSX, splitProps } from 'solid-js'
import { cn } from '../../lib/utils'

interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card(props: CardProps) {
  const [local, others] = splitProps(props, ['class', 'hover', 'padding', 'children'])

  const paddingStyles = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  return (
    <div
      class={cn(
        'bg-white rounded-2xl shadow-card border border-ktip-sand-100',
        local.hover && 'hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 cursor-pointer',
        paddingStyles[local.padding || 'md'],
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  )
}
