import { useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'

interface FlowingMenuItemProps {
  to: string
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
  onClick?: () => void
  className?: string
  children: ReactNode
}

/**
 * Link with a "flowing menu" hover effect: a colored band slides in from the
 * edge the cursor entered, scrolling the label as an endless marquee, and
 * slides back out toward the edge the cursor left from.
 */
export function FlowingMenuItem({ to, label, icon: Icon, onClick, className, children }: FlowingMenuItemProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  const [hovered, setHovered] = useState(false)
  const [edge, setEdge] = useState<'top' | 'bottom'>('top')

  const edgeFor = (e: MouseEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return 'top' as const
    return e.clientY < r.top + r.height / 2 ? ('top' as const) : ('bottom' as const)
  }

  return (
    <Link
      ref={ref}
      to={to}
      onClick={onClick}
      onMouseEnter={(e) => {
        setEdge(edgeFor(e))
        setHovered(true)
      }}
      onMouseLeave={(e) => {
        setEdge(edgeFor(e))
        setHovered(false)
      }}
      className={`relative overflow-hidden ${className ?? ''}`}
    >
      {children}
      <span
        aria-hidden
        className={`absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-ktip-nav-accent pointer-events-none transition-transform duration-300 ease-out ${
          hovered ? 'translate-y-0' : edge === 'top' ? '-translate-y-[102%]' : 'translate-y-[102%]'
        }`}
      >
        {/* Icon stays steady; label pulses */}
        <span className="flex items-center gap-3 px-4">
          {Icon && <Icon size={18} className="text-ktip-nav-accent-contrast shrink-0" />}
          <span className="animate-pulse-soft text-lg font-display font-semibold uppercase tracking-wider text-ktip-nav-accent-contrast whitespace-nowrap">
            {label}
          </span>
        </span>
      </span>
    </Link>
  )
}
