import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Chip tone. Each is a brand ramp at 50/700/200 — the fill is light, the text
 * is shade 700, which is the minimum legible shade for tropical and sun on a
 * light ground (see the contrast note in index.css). `muted` is the
 * deliberately recessive one: it carries "not open to collaboration", which is
 * an absence and should not read as a claim.
 */
export type TagTone = 'ocean' | 'tropical' | 'sun' | 'muted'

const TONE: Record<TagTone, string> = {
  ocean: 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200',
  tropical: 'bg-ktip-tropical-50 text-ktip-tropical-700 border-ktip-tropical-200',
  sun: 'bg-ktip-sun-50 text-ktip-sun-700 border-ktip-sun-200',
  muted: 'bg-ktip-sand-50 text-ktip-sand-500 border-ktip-sand-200',
}

/**
 * Squarer than a pill. Both profile surfaces read as documents rather than as
 * a tag cloud, and `rounded-control` is the token for a chip.
 */
export const TAG_CHIP =
  'inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-micro font-medium'

interface ProfileTagsProps {
  values: string[]
  tone?: TagTone
  /** Per-value overrides — the "exclusive" collaboration value goes muted. */
  toneFor?: (value: string) => TagTone
  /** Leading glyph on every chip (the handshake on collaboration values). */
  icon?: ReactNode
  /** Translated display text; defaults to the raw value. */
  labelFor?: (value: string) => string
  className?: string
}

/**
 * A row of chips: skills, interests, open-to.
 *
 * Replaces the page's `TagRow`, the drawer's `CHIP` constant and the three
 * inline chip blocks that had each grown their own colour pairing. They
 * disagreed: the page rendered skills as fully round `rounded-full` pills and
 * the drawer rendered the same data as `rounded-md` chips, so the two surfaces
 * did not look like the same product.
 */
export function ProfileTags({
  values,
  tone = 'ocean',
  toneFor,
  icon,
  labelFor,
  className,
}: ProfileTagsProps) {
  if (!values.length) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {values.map((value) => (
        <span key={value} className={cn(TAG_CHIP, TONE[toneFor?.(value) || tone])}>
          {icon}
          {labelFor?.(value) || value}
        </span>
      ))}
    </div>
  )
}
