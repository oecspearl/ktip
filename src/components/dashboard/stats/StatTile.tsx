import { Link } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface StatTileProps {
  label: string
  /** null renders an em dash — the tile is present, the number is not readable */
  value: number | null
  icon: LucideIcon
  /** Makes the whole tile a link */
  to?: string
  /** The lead tile of the bento block, which gets four times the area */
  hero?: boolean
  className?: string
}

const SHELL =
  'flex flex-col justify-between gap-3 rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-4 shadow-neu-sm'

/**
 * One number on the Overview bento.
 *
 * The value carries the weight, so it gets the display face and tabular
 * figures — the same reading as the platform stat band on the home page. The
 * hero variant only scales the type: a tile four times the area with the same
 * 3xl number in the corner reads as a tile that failed to fill.
 */
export function StatTile({ label, value, icon: Icon, to, hero, className }: StatTileProps) {
  const body = (
    <>
      <Icon size={hero ? 26 : 18} className="text-ktip-ocean-600" />
      <div className="min-w-0">
        <div
          className={cn(
            'font-display font-extrabold leading-none tabular-nums text-ktip-sand-900',
            hero ? 'text-6xl' : 'text-3xl'
          )}
        >
          {value === null ? '—' : value.toLocaleString()}
        </div>
        <div
          className={cn(
            'mt-1.5 truncate font-semibold uppercase tracking-wider text-ktip-sand-500',
            hero ? 'text-sm' : 'text-xs'
          )}
        >
          {label}
        </div>
      </div>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className={cn(SHELL, 'transition-colors hover:border-ktip-ocean-300', className)}
      >
        {body}
      </Link>
    )
  }

  return <div className={cn(SHELL, className)}>{body}</div>
}

/** Card shell the charts share, so a chart and a tile read as the same object. */
export function StatCard({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(SHELL, 'gap-4', className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">{title}</h3>
      <div className="flex-1">{children}</div>
    </div>
  )
}
