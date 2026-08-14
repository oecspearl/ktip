import { Link } from 'react-router'
import { Flag } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { cn } from '../../lib/utils'

interface ReportInfringementLinkProps {
  /** Mirrors takedown_notices.target_type. Prefills the form for triage. */
  targetType?: string
  targetId?: string
  className?: string
}

/**
 * The quiet link at the foot of a public content page.
 *
 * Deliberately not the in-app report control next to it: that one requires a
 * session and routes to the conduct queue, and the person who needs this one is
 * usually a rightsholder with no KTIP account. It navigates to a public form,
 * carrying the current URL so nobody has to copy an address by hand and get it
 * wrong.
 */
export function ReportInfringementLink({
  targetType,
  targetId,
  className,
}: ReportInfringementLinkProps) {
  const params = new URLSearchParams()
  if (targetType) params.set('type', targetType)
  if (targetId) params.set('id', targetId)
  if (typeof window !== 'undefined') params.set('url', window.location.href)

  return (
    <Link
      to={`/legal/copyright/report?${params.toString()}`}
      className={cn(
        'inline-flex items-center gap-1.5 text-caption text-ktip-sand-500 hover:text-ktip-sand-700',
        className
      )}
    >
      <Flag size={13} aria-hidden />
      <Trans>Report infringement</Trans>
    </Link>
  )
}
