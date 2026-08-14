import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Info, Languages, ShieldCheck, Sparkles, X } from 'lucide-react'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { MessageDescriptor } from '@lingui/core'
import {
  dismissDisclaimer,
  useIsDisclaimerDismissed,
  type DisclaimerVariant,
} from '../../lib/disclaimer-dismissals'
import { cn } from '../../lib/utils'

export type { DisclaimerVariant }

interface DisclaimerProps {
  variant: DisclaimerVariant
  /**
   * inline — one muted line inside a panel.
   * block  — bordered note that has to be read past.
   * footer — page-bottom, quiet, always present.
   */
  placement?: 'inline' | 'block' | 'footer'
  /** Honoured on `inline` only, and remembered per variant per device. */
  dismissible?: boolean
  /** Replaces the default text where a surface needs to be more specific. */
  children?: ReactNode
  className?: string
}

/**
 * One copy table, keyed by variant.
 *
 * Centralised so the AI caveat is worded identically on the grant reviewer, the
 * assistant and the extraction panel — a caveat that is phrased three ways reads
 * as three different claims, and only one of them gets remembered.
 *
 * `msg` rather than `t`: module scope, evaluated at import, resolved at render.
 */
const COPY: Record<
  DisclaimerVariant,
  { text: MessageDescriptor; linkLabel: MessageDescriptor; href: string; icon: typeof Info }
> = {
  ai: {
    text: msg`AI can get things wrong, and it is most convincing when it is being specific. Check anything that matters before you rely on it.`,
    linkLabel: msg`How we use AI`,
    href: '/legal/ai-disclosure',
    icon: Sparkles,
  },
  translation: {
    text: msg`Machine-translated from the original. The original is what the author wrote.`,
    linkLabel: msg`About machine translation`,
    href: '/legal/ai-disclosure#machine-translation',
    icon: Languages,
  },
  funding: {
    text: msg`Funding opportunities are published by their sponsors, not verified by KTIP. No legitimate funder charges you a fee to receive a grant.`,
    linkLabel: msg`Before you apply`,
    href: '/legal/funding-disclaimer',
    icon: AlertTriangle,
  },
  advice: {
    text: msg`Published for information. This is not professional, legal or financial advice.`,
    linkLabel: msg`Terms of Use`,
    href: '/legal/terms',
    icon: Info,
  },
  safeguarding: {
    text: msg`Members under 18 have extra protections on this platform, and some features work differently for them.`,
    linkLabel: msg`How we protect young members`,
    href: '/legal/safeguarding',
    icon: ShieldCheck,
  },
}

export function Disclaimer({
  variant,
  placement = 'inline',
  dismissible = false,
  children,
  className,
}: DisclaimerProps) {
  const { i18n } = useLingui()
  const dismissed = useIsDisclaimerDismissed(variant)

  // A dismissal only ever silences the inline form. If a surface needs the
  // caveat read, it asks for `block` or `footer`, and those ignore the flag.
  const canDismiss = dismissible && placement === 'inline'
  if (canDismiss && dismissed) return null

  const copy = COPY[variant]
  const Icon = copy.icon
  const body = children ?? i18n._(copy.text)

  const link = (
    <Link
      to={copy.href}
      className="font-medium text-ktip-ocean-700 underline underline-offset-2 hover:opacity-80"
    >
      {i18n._(copy.linkLabel)}
    </Link>
  )

  if (placement === 'block') {
    const warn = variant === 'funding'
    return (
      <div
        role="note"
        className={cn(
          'flex gap-3 rounded-surface border p-4',
          warn
            ? 'border-ktip-sun-300 bg-ktip-sun-50'
            : 'border-ktip-ocean-200 bg-ktip-ocean-50',
          className
        )}
      >
        <Icon
          size={17}
          aria-hidden
          className={cn('mt-0.5 shrink-0', warn ? 'text-ktip-sun-700' : 'text-ktip-ocean-600')}
        />
        <p className="text-body leading-relaxed text-ktip-sand-800">
          {body} {link}
        </p>
      </div>
    )
  }

  if (placement === 'footer') {
    return (
      <div
        role="note"
        className={cn(
          'mt-10 border-t border-ktip-sand-200 pt-4 text-caption leading-relaxed text-ktip-sand-500',
          className
        )}
      >
        <p className="flex items-start gap-2">
          <Icon size={14} aria-hidden className="mt-0.5 shrink-0 text-ktip-sand-400" />
          <span>
            {body} {link}
          </span>
        </p>
      </div>
    )
  }

  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-2 text-caption leading-relaxed text-ktip-sand-500',
        className
      )}
    >
      <Icon size={13} aria-hidden className="mt-0.5 shrink-0 text-ktip-sand-400" />
      <span className="flex-1">
        {body} {link}
      </span>
      {canDismiss && (
        <button
          type="button"
          onClick={() => dismissDisclaimer(variant)}
          aria-label={i18n._(msg`Stop showing this note`)}
          className="shrink-0 rounded p-0.5 text-ktip-sand-400 hover:text-ktip-sand-700"
        >
          <X size={13} aria-hidden />
        </button>
      )}
    </div>
  )
}
