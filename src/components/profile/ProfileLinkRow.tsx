import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ProfileLinkRowProps {
  to: string
  label: string
  /** One line under the title — role, status, date. Omitted when there is none. */
  meta?: ReactNode
  /**
   * Leading thumbnail. Falls back to a tinted placeholder holding `icon`, so a
   * project without artwork still lines up with one that has it.
   */
  image?: string | null
  icon?: ReactNode
  className?: string
}

/**
 * A project or event on a profile.
 *
 * Both surfaces rendered these as bare text links: a title, a chevron, and
 * nothing else. A visitor could not tell whether "WaterSafe Montserrat" was
 * something the member led or something they joined, nor whether it was live.
 * The thumbnail also gives the row a fixed height, so a list of three reads as
 * one object instead of three unrelated lines.
 */
export function ProfileLinkRow({
  to,
  label,
  meta,
  image,
  icon,
  className,
}: ProfileLinkRowProps) {
  return (
    <Link
      to={to}
      className={cn(
        'group -mx-2 flex items-center gap-3 rounded-surface px-2 py-2.5 transition-colors hover:bg-ktip-sand-50',
        className
      )}
    >
      <span className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-ktip-ocean-100 text-ktip-ocean-600">
        {image ? (
          <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          icon
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-bold text-ktip-sand-900 group-hover:text-ktip-ocean-700">
          {label}
        </span>
        {meta && <span className="block truncate text-micro text-ktip-sand-500">{meta}</span>}
      </span>

      <ChevronRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-ktip-sand-300 transition-all group-hover:translate-x-0.5 group-hover:text-ktip-ocean-500"
      />
    </Link>
  )
}
