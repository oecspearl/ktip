import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RouteSplash } from '../../components/RouteSplash'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useMfaRecovery } from '../../hooks/useMfa'
import { usePageTitle } from '../../hooks/usePageTitle'
import { backupCodeSchema } from '../../lib/validation'
import { formatBackupCode } from '../../lib/mfa'

/**
 * Spending a recovery code (118).
 *
 * A code is NOT a second factor — GoTrue owns the assurance level and there is
 * no way for us to promote a session from the outside. So this buys exactly one
 * thing: the lost authenticator is deleted and the member is sent back to enrol
 * a new one, reaching aal2 the honest way.
 */
export default function MfaRecoverPage() {
  const { t } = useLingui()
  usePageTitle(t`Use a recovery code`)
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const recover = useMfaRecovery()

  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (auth.loading || auth.profileLoading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />
  }

  const parsed = backupCodeSchema.safeParse(code)
  const fieldError = touched && !parsed.success ? parsed.error.issues[0]?.message : undefined

  const submit = async () => {
    setTouched(true)
    if (!parsed.success) return
    setErrorMessage('')
    try {
      await recover.mutateAsync(code)
      // The factor is gone, so requires_mfa_enrollment is TRUE again and the
      // gate routes to setup. Recheck first: the challenge flag is computed from
      // a session whose factor no longer exists.
      await auth.recheckMfaChallenge()
      await auth.refreshProfile()
      toast.success(t`Recovery code accepted. Set up a new authenticator.`)
      navigate('/security/set-up', { replace: true })
    } catch (error: any) {
      setErrorMessage(error?.message || t`That code was not accepted.`)
    }
  }

  const steps = [{ title: t`Recovery`, caption: t`Lost the phone, not the account.` }]

  return (
    <AuthSplitShell step={1} steps={steps} heading={t`Use a recovery code`} heroOffset={5}>
      <div className="space-y-5">
        <div className="flex gap-3 rounded-control border border-ktip-sand-200 bg-ktip-sand-50/50 p-4">
          <KeyRound size={20} className="text-ktip-sand-500 shrink-0 mt-0.5" />
          <p className="text-body-sm text-ktip-sand-700">
            <Trans>
              Enter one of the codes you saved when you set up two-step verification. It works
              once, and it lets you set up a new authenticator app.
            </Trans>
          </p>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {errorMessage}
          </div>
        )}

        <Input
          label={t`Recovery code`}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
          placeholder={formatBackupCode('ABCDE12345')}
          autoComplete="off"
          spellCheck={false}
          className="font-mono tracking-wider uppercase"
          error={fieldError}
          fullWidth
        />

        <Button type="button" fullWidth loading={recover.isPending} onClick={() => void submit()}>
          <Trans>Use this code</Trans>
        </Button>

        <div className="flex items-center justify-between text-body-sm">
          <Link to="/security/verify" className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium">
            <Trans>Back to the code from my app</Trans>
          </Link>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="text-ktip-sand-500 hover:text-ktip-sand-700"
          >
            <Trans>Sign out</Trans>
          </button>
        </div>

        <p className="text-caption text-ktip-sand-500">
          <Trans>
            Out of codes? Contact KTIP support — an administrator can reset two-step verification
            on your account.
          </Trans>
        </p>
      </div>
    </AuthSplitShell>
  )
}
