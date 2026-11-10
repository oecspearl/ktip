import { Link } from 'react-router'
import { BadgeCheck, Clock, PauseCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useMyVerificationRequest } from '../../hooks/useVerification'
import { useMyVerificationStatus } from '../../hooks/useVerificationLifecycle'

/**
 * What an unverified account sees in place of a page it may not open (205).
 *
 * Rendered by ProtectedRoute, AccountRoute and UnverifiedWallRoute instead of
 * the page, never as a redirect: the address stays put, so the same page simply
 * appears once the account is verified and the profile refetches.
 *
 * Five states, most specific first: on hold (an admin paused it), lapsed (the
 * 12-month term ran out), rejected, pending, and never started.
 */
export function VerificationWall() {
  const { t } = useLingui()
  const auth = useAuth()
  const { status } = useMyVerificationStatus(auth.user?.id)
  const { request } = useMyVerificationRequest(auth.user?.id)

  const state: 'hold' | 'lapsed' | 'rejected' | 'pending' | 'new' = status?.on_hold
    ? 'hold'
    : status?.lapsed
      ? 'lapsed'
      : request?.status === 'rejected'
        ? 'rejected'
        : request?.status === 'pending'
          ? 'pending'
          : 'new'

  const Icon =
    state === 'hold'
      ? PauseCircle
      : state === 'lapsed'
        ? RefreshCw
        : state === 'rejected'
          ? ShieldAlert
          : state === 'pending'
            ? Clock
            : BadgeCheck

  const cta =
    state === 'lapsed'
      ? t`Renew verification`
      : state === 'rejected'
        ? t`Send new documents`
        : state === 'pending' || state === 'hold'
          ? t`Open the Verification tab`
          : t`Get verified`

  return (
    <section
      aria-labelledby="verification-wall-title"
      className="mx-auto flex w-full max-w-prose flex-col items-center px-4 py-16 text-center"
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
          state === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-ktip-ocean-50 text-ktip-ocean-600'
        }`}
      >
        <Icon size={24} aria-hidden="true" />
      </div>

      <h1 id="verification-wall-title" className="text-xl font-semibold text-ktip-sand-900">
        {state === 'hold' ? (
          <Trans>Your verification is on hold</Trans>
        ) : state === 'lapsed' ? (
          <Trans>Your verification has expired</Trans>
        ) : state === 'rejected' ? (
          <Trans>Your verification was not approved</Trans>
        ) : state === 'pending' ? (
          <Trans>Your verification is being reviewed</Trans>
        ) : (
          <Trans>Verify your account to open this page</Trans>
        )}
      </h1>

      <p className="mt-3 text-sm text-ktip-sand-600">
        {state === 'hold' ? (
          <Trans>
            An administrator has paused your verification. The Verification tab says what happens
            next.
          </Trans>
        ) : state === 'lapsed' ? (
          <Trans>
            Verification lasts a year. Renew it to open this page again. With a work or school email
            it takes about a minute.
          </Trans>
        ) : state === 'rejected' ? (
          <Trans>Read the reviewer's note on the Verification tab, then send new documents.</Trans>
        ) : state === 'pending' ? (
          <Trans>This page opens when your verification is approved.</Trans>
        ) : (
          <Trans>
            A work or school email, or a code from your organisation, verifies you straight away.
            Otherwise you can upload an ID for review.
          </Trans>
        )}
      </p>

      <p className="mt-3 text-sm text-ktip-sand-600">
        <Trans>
          Until then you can read the grant and event listings and the forums, and set up your
          profile.
        </Trans>
      </p>

      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
        <Link to="/dashboard/verification">
          <Button size="sm">{cta}</Button>
        </Link>
        <Link to="/grants">
          <Button size="sm" variant="secondary">
            {t`Browse grants`}
          </Button>
        </Link>
      </div>
    </section>
  )
}
