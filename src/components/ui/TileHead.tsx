import type { ReactNode } from 'react'

interface TileHeadProps {
  /** Small lucide icon, sized ~16. Optional — most tiles carry one. */
  icon?: ReactNode
  title: ReactNode
  /** One short line under the title. Kept to a line or two; tiles are narrow. */
  hint?: ReactNode
  /** Right-aligned link or control on the title row. */
  action?: ReactNode
}

/**
 * Header row for a bento tile.
 *
 * Denser than the `text-lg` + `mb-4` heading the settings cards used to carry
 * one-per-full-width-card: in a grid the header repeats three times per row, so
 * every pixel it spends is spent three times over.
 */
export function TileHead({ icon, title, hint, action }: TileHeadProps) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-display font-bold text-ktip-sand-900">
          {icon}
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs leading-relaxed text-ktip-sand-600">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
