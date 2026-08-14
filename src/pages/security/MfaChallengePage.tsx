import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../contexts/AuthContext'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RouteSplash } from '../../components/RouteSplash'
import { Button } from '../../components/ui/Button'
import { OtpInput } from '../../components/ui/OtpInput'
import { useMfaFactors, useMfaMutations } from '../../hooks/useMfa'
import { usePageTitle } from '../../hooks/usePageTitle'

/**
 * The sign-in challenge (118). Reached only by an account that already holds a
 * verified factor — getAuthenticatorAssuranceLevel reports nextLevel 'aal1' for
 * everyone else, so this can never collide with the enrolment gate.
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

  const handleVerify = async (submitted: string) => {
    if (!factorId || submitted.length !== 6) return
    setErrorMessage('')
    try {
      await verify({ factorId, code: submitted })
      // The token that carries aal2 has just been swapped in; recompute rather
      // than waiting for the next auth event, or ProtectedRoute reads a stale
      // flag and bounces straight back here.
      await auth.recheckMfaChallenge()
      navigate(from && from !== '/security/verify' ? from : '/', { replace: true })
    } catch (error: any) {
      setCode('')
      setErrorMessage(
        error?.message ||
          t`That code was not accepted. If it keeps failing, check that automatic date & time is switched on for your phone — an authenticator that is more than 30 seconds out will never produce a code we can accept.`,
      )
    }
  }

  const steps = [{ title: t`Verify`, caption: t`Two steps in, and the account is yours alone.` }]

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

        {/* Three ways off this page and no fourth. A member who cannot produce a
            code and cannot sign out is trapped holding a session that does
            nothing. */}
        <div className="flex items-center justify-between text-body-sm">
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
    </AuthSplitShell>
  )
}
