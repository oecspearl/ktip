import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../contexts/AuthContext'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RouteSplash } from '../../components/RouteSplash'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { OtpInput } from '../../components/ui/OtpInput'
import { EmailCodeCard } from '../../components/security/EmailCodeCard'
import { AuthenticatorAppGuide } from '../../components/security/AuthenticatorAppGuide'
import { useMfaFactors, useMfaMutations } from '../../hooks/useMfa'
import { usePageTitle } from '../../hooks/usePageTitle'
import { analytics } from '../../hooks/useAnalytics'

/**
 * The sign-in challenge (118, 150). Reached by an account that already holds a
 * verified factor — getAuthenticatorAssuranceLevel reports nextLevel 'aal1' for
 * everyone else — or, since 150, by an email-method account whose session has
 * no live step-up. AuthContext folds both into `mfaChallengeRequired` and says
 * which with `mfaMethod`; this page only picks the form.
 *
 * A bare route for the same reason as the setup page: it is what ProtectedRoute
 * redirects TO.
 */
export default function MfaChallengePage() {
  const { t } = useLingui()
  usePageTitle(t`Verify it's you`)
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { factors, loading } = useMfaFactors(auth.user?.id)
  const { verify, verifying } = useMfaMutations(auth.user?.id)
  const [code, setCode] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  if (auth.loading || auth.profileLoading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />
  }

  if (!auth.mfaChallengeRequired) {
    return <Navigate to="/" replace />
  }

  const factorId = factors[0]?.id ?? null
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
  const destination = from && from !== '/security/verify' ? from : '/'

  const handleVerify = async (submitted: string) => {
    if (!factorId || submitted.length !== 6) return
    setErrorMessage('')
    try {
      await verify({ factorId, code: submitted })
      // The token that carries aal2 has just been swapped in; recompute rather
      // than waiting for the next auth event, or ProtectedRoute reads a stale
      // flag and bounces straight back here.
      await auth.recheckMfaChallenge()
      navigate(destination, { replace: true })
    } catch (error: any) {
      setCode('')
      setErrorMessage(
        error?.message ||
          t`That code was not accepted. If it keeps failing, check that automatic date & time is switched on for your phone — an authenticator that is more than 30 seconds out will never produce a code we can accept.`,
      )
    }
  }

  const handleEmailVerified = async () => {
    await auth.recheckMfaChallenge()
    navigate(destination, { replace: true })
  }

  const steps = [{ title: t`Verify`, caption: t`Two steps in, and the account is yours alone.` }]

  // The email member's challenge. Recovery codes do not apply — there is no
  // factor to recover — so the only other way off the page is out.
  if (auth.mfaMethod === 'email') {
    return (
      <AuthSplitShell step={1} steps={steps} heading={t`Verify it's you`} heroOffset={5}>
        <div className="space-y-5">
          <EmailCodeCard
            email={auth.user.email}
            userId={auth.user.id}
            mode="verify"
            onVerified={handleEmailVerified}
          />
          <div className="flex items-center justify-end text-body-sm">
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="text-ktip-sand-500 hover:text-ktip-sand-700"
            >
              <Trans>Sign out</Trans>
            </button>
          </div>
        </div>
      </AuthSplitShell>
    )
  }

  return (
    <AuthSplitShell step={1} steps={steps} heading={t`Verify it's you`} heroOffset={5}>
      <div className="space-y-5">
        <p className="text-body-sm text-ktip-sand-600">
          <Trans>Open your authenticator app and enter the 6-digit code it shows.</Trans>
        </p>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {errorMessage}
          </div>
        )}

        <OtpInput
          label={t`Authentication code`}
          value={code}
          onChange={setCode}
          onComplete={handleVerify}
          disabled={verifying || loading}
          autoFocus
        />

        <Button
          type="button"
          fullWidth
          loading={verifying}
          disabled={code.length !== 6 || !factorId}
          onClick={() => handleVerify(code)}
        >
          <Trans>Verify</Trans>
        </Button>

        {/* Four ways off this page and no fifth. A member who cannot produce a
            code and cannot sign out is trapped holding a session that does
            nothing; a member who cannot FIND the code needs the fourth (150). */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
          <button
            type="button"
            onClick={() => {
              setShowHelp(true)
              analytics.funnel('mfa', 'challenge_help_opened')
            }}
            className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
          >
            <Trans>Where do I find my code?</Trans>
          </button>
          <Link to="/security/recover" className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
            <Trans>Use a recovery code</Trans>
          </Link>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="text-ktip-sand-500 hover:text-ktip-sand-700"
          >
            <Trans>Sign out</Trans>
          </button>
        </div>
      </div>

      <Modal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        title={t`Finding your code`}
        description={t`The code is in the authenticator app you set up, under KTIP.`}
        size="lg"
      >
        <AuthenticatorAppGuide mode="help" />
      </Modal>
    </AuthSplitShell>
  )
}
