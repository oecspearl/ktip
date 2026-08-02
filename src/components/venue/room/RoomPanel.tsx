import type { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

interface RoomPanelProps {
  title: string
  /** Small number or word on the right of the header. */
  meta?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * The card every aside section sits in.
 *
 * Deliberately identical to RoomOccupantList's own shell rather than a
 * refactor of it: the occupant list is reused verbatim in several places
 * outside the venue, and a stack of panels that agree about their border radius
 * matters more than one fewer copy of four class names.
 */
export function RoomPanel({ title, meta, children, className }: RoomPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-ktip-sand-100 bg-ktip-cream shadow-card',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-ktip-sand-100 px-4 py-3">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
          {title}
        </h2>
        {meta !== undefined && (
          <span className="shrink-0 text-xs font-medium text-ktip-sand-500">{meta}</span>
        )}
      </div>
      {children}
    </div>
  )
}

/** The one-line "nothing here" state, so every panel says it the same way. */
export function RoomPanelEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm text-ktip-sand-500">{children}</p>
}
