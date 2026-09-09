import { BadgeCheck } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'

interface VerifiedBadgeProps {
  /** Renders nothing when false, so call sites drop their own `&&` guard. */
  verified?: boolean | null
  /**
   * Optical size of the mark in px. The only thing a call site tunes — the
   * icon, the hue and the wording are fixed so the badge reads as one thing
   * wherever it appears.
   */
  size?: number
  /**
   * `brand`   — ocean on a normal surface. The scale inverts in dark mode, so
   *             one token covers both themes.
   * `inverse` — white on a filled band, a photo hero or any dark backdrop.
   */
  tone?: 'brand' | 'inverse'
  /** `icon` sits beside a name; `pill` carries the word, for tables and heroes. */
  variant?: 'icon' | 'pill'
  /** Overrides the wording. Organisations say "Chamber verified". */
  label?: string
  /** Hover text. Defaults to the label — the org pill adds the date. */
  title?: string
  className?: string
}

/**
 * The verified mark — the one place the platform draws it.
 *
 * lucide's `BadgeCheck` and not `CheckCircle`: the circled tick is already
 * spent on toasts, approvals and every other success state, so a member's
 * standing needs a glyph that cannot be read as "this action worked".
 */
export function VerifiedBadge({
  verified,
  size = 16,
  tone = 'brand',
  variant = 'icon',
  label,
  title,
  className,
}: VerifiedBadgeProps) {
  const { t } = useLingui()
  if (!verified) return null

  const text = label ?? t`Verified member`

  if (variant === 'pill') {
    return (
      <span
        title={title ?? text}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium',
          tone === 'inverse'
            ? 'bg-white/15 text-white ring-1 ring-white/30'
            : 'bg-ktip-ocean-100 text-ktip-ocean-700 ring-1 ring-ktip-ocean-200',
          className
        )}
      >
        <BadgeCheck size={size} className="shrink-0" aria-hidden="true" />
        {text}
      </span>
    )
  }

  return (
    <BadgeCheck
      size={size}
      role="img"
      aria-label={text}
      className={cn(
        'shrink-0',
        tone === 'inverse' ? 'text-white' : 'text-ktip-ocean-500',
        className
      )}
    >
      <title>{title ?? text}</title>
    </BadgeCheck>
  )
}
