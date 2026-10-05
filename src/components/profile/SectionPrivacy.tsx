import { Globe, Lock } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'

export interface SectionPrivacyProps {
  /** The section's name, already translated: "your skills", "achievements". */
  label: string
  isPrivate: boolean
  onChange: (makePrivate: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * Who sees one part of the profile, set where that part is (162).
 *
 * Always visible, unlike the pencil beside it. The pencil is an affordance and
 * can wait for a hover; this is state, and a setting you can only read by
 * hovering is one you will get wrong. The words say the current audience, so
 * a column of these reads as a list of who-sees-what without opening anything.
 *
 * A switch rather than a menu: there are two audiences. If "only me" ever
 * joins them this becomes a menu, and the stored values already allow for it.
 */
export function SectionPrivacy({
  label,
  isPrivate,
  onChange,
  disabled,
  className,
}: SectionPrivacyProps) {
  const { t } = useLingui()
  const hint = isPrivate
    ? t`Only your connections see ${label}. Select to show everyone.`
    : t`Every member sees ${label}. Select to keep it for your connections.`

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isPrivate}
      aria-label={t`Keep ${label} for connections only`}
      title={hint}
      onClick={() => onChange(!isPrivate)}
      disabled={disabled}
      className={cn(
        // Set in the body face whatever heading it lands in: the rail's
        // headings are tracked uppercase, and "EVERYONE" in 0.16em tracking
        // reads as a second title rather than a control.
        'inline-flex shrink-0 items-center gap-1 rounded-neu-sm px-2 py-1 font-sans text-micro font-semibold normal-case tracking-normal transition-all',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ktip-ocean-500',
        'disabled:cursor-wait disabled:opacity-60',
        isPrivate
          ? 'bg-ktip-sand-100 text-ktip-sand-700 shadow-neu-sm-inset'
          : 'text-ktip-sand-500 hover:-translate-y-px hover:text-ktip-ocean-700 hover:shadow-neu-sm',
        className
      )}
    >
      {isPrivate ? <Lock size={12} aria-hidden="true" /> : <Globe size={12} aria-hidden="true" />}
      {isPrivate ? <Trans>Connections</Trans> : <Trans>Everyone</Trans>}
    </button>
  )
}
