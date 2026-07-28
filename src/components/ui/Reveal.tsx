import type { CSSProperties, ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  /** Stagger slot, top to bottom: delay = order * 80ms. */
  order?: number
  className?: string
}

/** Slide-up + fade reveal. Re-fires on navigation because the routed
 *  subtree is keyed by pathname in MainLayout/AdminLayout. */
export function Reveal({ children, order = 0, className = '' }: RevealProps) {
  const style: CSSProperties | undefined =
    order > 0 ? { animationDelay: `${order * 80}ms` } : undefined
  return (
    <div className={`animate-reveal-up ${className}`} style={style}>
      {children}
    </div>
  )
}
