import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { BadgeCheck, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../contexts/AuthContext'

const DISMISS_KEY = 'ktip:unverified-banner-dismissed'

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * One line under the navbar for an unverified account (205): what it can do
 * now and where verification is. Dismissed for the browser session, because a
 * member who has read it once does not need it on every page; it comes back
 * next visit while the account is still unverified.
 *
 * Hidden on the Verification tab itself, where it would only point at the
 * page it is on.
 */
export function UnverifiedBanner() {
  const { t } = useLingui()
  const auth = useAuth()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!auth.user || !auth.profile || auth.profileLoading || auth.verified) return null
  if (dismissed || pathname.startsWith('/dashboard/verification')) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode: dismissed for this page view only */
    }
  }

  return (
    <div role="status" className="border-b border-ktip-ocean-200 bg-ktip-ocean-50">
      <div className="mx-auto flex w-full max-w-page items-start gap-3 px-4 py-2 sm:items-center">
        <BadgeCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ktip-ocean-600 sm:mt-0" />
        <p className="min-w-0 flex-1 text-sm text-ktip-sand-800">
          <Trans>
            Your account is read-only until it is verified. You can read the grant and event listings
            and the forums, and set up your profile.
          </Trans>{' '}
          <Link to="/dashboard/verification" className="font-medium text-ktip-ocean-700 underline">
            <Trans>Get verified</Trans>
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t`Hide this message`}
          className="shrink-0 rounded-control p-1 text-ktip-sand-600 hover:bg-ktip-ocean-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
