import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { AuthSplitShell, type AuthStep } from '../../components/auth/AuthSplitShell'
import { RouteSplash } from '../../components/RouteSplash'
import { Button } from '../../components/ui/Button'
import { TotpEnrollCard } from '../../components/security/TotpEnrollCard'
import { BackupCodesSheet } from '../../components/security/BackupCodesSheet'
import { MethodPicker } from '../../components/security/MethodPicker'
import { EmailCodeCard } from '../../components/security/EmailCodeCard'
import { AuthenticatorAppGuide } from '../../components/security/AuthenticatorAppGuide'
import { useMfaFactors, useMfaMutations } from '../../hooks/useMfa'
import { usePageTitle } from '../../hooks/usePageTitle'
import { analytics } from '../../hooks/useAnalytics'
import { APP_FULL_NAME } from '../../lib/constants'
import type { MfaMethod } from '../../types'

/**
 * Two-factor enrolment (118, 150). A bare route, deliberately outside the
 * ProtectedRoute subtree — inside it, the gate that sends people here would send
 * them here from here.
 *
 * All three signup paths converge on this one page: the email wizard navigates
 * here after the OTP, OAuth onboarding after the role is written, and Virtual
 * Campus arrives through ProtectedRoute without knowing this page exists. One
 * component, three entry points, which is what makes switching another role on
 * a config change rather than a code change.
 *
 * Since 150 it is a choice, not a wall. Step one asks HOW the member wants their
 * code — an authenticator app, or an email — and only then starts the flow for
 * that method. Settings deep-links straight to a method with `?method=`.
 */

function methodFromParam(value: string | null): MfaMethod | null {
  return value === 'totp' || value === 'email' ? value : null
}

export default function MfaSetupPage() {
  const { t } = useLingui()
  usePageTitle(t`Set up two-step verification`)
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const { enroll, verify, issueCodes, enrolling, verifying, issuing } = useMfaMutations(auth.user?.id)
  const { enrolled } = useMfaFactors(auth.user?.id)

  const [method, setMethod] = useState<MfaMethod | null>(() => methodFromParam(searchParams.get('method')))
  const [picked, setPicked] = useState<MfaMethod | null>(method)

  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Holds the page open once enrolment succeeds. Without it the gate clears,
  // the self-exit below fires, and the recovery sheet is destroyed before the
  // member has copied a single code.
  const finishing = useRef(false)
  // React 19 StrictMode runs effects twice in dev, and every enroll() call
  // persists a factor — so the guard is not belt-and-braces, it is the
  // difference between one enrolment and a slow leak toward GoTrue's limit.
  //
  // Enrolment starts only once the authenticator is CHOSEN (150): choosing
  // email must leave no half-made factor behind.
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !auth.user?.id || method !== 'totp') return
    started.current = true
    analytics.funnel('mfa', 'enrol_started')
    void (async () => {
      try {
        const result = await enroll()
        setFactorId(result.factorId)
        setQrCode(result.qrCode)
        setSecret(result.secret)
        setUri(result.uri)
      } catch (error: any) {
        setErrorMessage(
          error?.message || t`We could not start the setup. Reload the page and try again.`,
        )
      }
    })()
  }, [auth.user?.id, method, enroll, t])

  if (auth.loading || auth.profileLoading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />
  }

  // An account with no role owes onboarding first — the MFA requirement is
  // derived from a role it does not hold yet. This should be unreachable, but
  // the alternative to checking is an infinite bounce between two pages.
  if (auth.profile && auth.profile.roles.length === 0) {
    return <Navigate to="/onboarding" replace />
  }

  // Already has a factor, and not mid-flow — nothing to do here.
  //
  // Keyed on the factor rather than on requires_mfa_enrollment, which is what an
  // earlier draft did and which broke the voluntary path: a member who owes
  // nothing and arrives from Settings to turn 2FA on would have been bounced
  // straight back out. The `finishing` ref then holds the page open long enough
  // for the recovery sheet to be read — without it the flag clears the instant
  // the factor verifies and the codes are destroyed before anyone copies them.
  //
  // An email-method account is NOT caught here (no factor), which is right: it
  // may be here to switch to an authenticator.
  if (enrolled && !finishing.current) {
    return <Navigate to="/" replace />
  }

  const chooseMethod = () => {
    if (!picked) return
    analytics.funnel('mfa', 'method_chosen', { method: picked })
    setErrorMessage('')
    setMethod(picked)
  }

  const changeMethod = () => {
    setErrorMessage('')
    setCode('')
    setMethod(null)
  }

  const handleVerify = async (submitted: string) => {
    if (!factorId || submitted.length !== 6) return
    setErrorMessage('')
    finishing.current = true
    try {
      await verify({ factorId, code: submitted })
      analytics.funnel('mfa', 'enrol_verified')
      const issued = await issueCodes()
      setCodes(issued)
    } catch (error: any) {
      finishing.current = false
      setCode('')
      setErrorMessage(
        error?.message ||
          t`That code was not accepted. If it keeps failing, check that automatic date & time is switched on for your phone — an authenticator that is more than 30 seconds out will never produce a code we can accept.`,
      )
    }
  }

  const handleEmailVerified = async () => {
    // verify_mfa_email_code() already cleared requires_mfa_enrollment on the
    // row; the profile query has to catch up BEFORE ProtectedRoute reads it, or
    // the dashboard bounces straight back here.
    await auth.refreshProfile()
    await auth.recheckMfaChallenge()
    toast.success(t`Two-step verification is on.`)
    navigate('/', { replace: true })
  }

  const chooseStep: AuthStep = { title: t`Choose`, caption: t`One more step. Then your account is yours alone.` }
  const steps: AuthStep[] =
    method === 'email'
      ? [chooseStep, { title: t`Email code`, caption: t`A code to your inbox, and you are in.` }]
      : [
          chooseStep,
          { title: t`Authenticator`, caption: t`A code from your app, and you are in.` },
          { title: t`Recovery codes`, caption: t`Keep these somewhere safe. They are your way back in.` },
        ]

  const onSheet = codes !== null
  const step = method === null ? 1 : onSheet ? 3 : 2
  const heading =
    method === null
      ? t`Set up two-step verification`
      : onSheet
        ? t`Save your recovery codes`
        : method === 'email'
          ? t`Check your email`
          : t`Set up your authenticator app`

  return (
    <AuthSplitShell
      step={step}
      steps={steps}
      heading={heading}
      subheading={method === null ? APP_FULL_NAME : undefined}
      heroOffset={5}
    >
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-5">
          {errorMessage}
        </div>
      )}

      {method === null && (
        <div className="space-y-5">
          <div className="flex gap-3 rounded-control border border-ktip-ocean-200 bg-ktip-ocean-50/50 p-4">
            <ShieldCheck size={20} className="text-ktip-ocean-600 shrink-0 mt-0.5" />
            <p className="text-body-sm text-ktip-sand-700">
              {auth.profile?.requires_mfa_enrollment ? (
                <Trans>
                  Your account applies for funding, so it needs a second step at sign-in. You can
                  use a free authenticator app, or a code sent to your email.
                </Trans>
              ) : (
                <Trans>
                  A second step at sign-in means a stolen password is not enough to reach your
                  account. Use a free authenticator app, or a code sent to your email.
                </Trans>
              )}
            </p>
          </div>

          <MethodPicker value={picked} onChange={setPicked} />

          <Button type="button" fullWidth disabled={!picked} onClick={chooseMethod}>
            <Trans>Continue</Trans>
          </Button>
        </div>
      )}

      {method === 'totp' && !onSheet && (
        <div className="space-y-6">
          <AuthenticatorAppGuide mode="setup" uri={uri} />

          <TotpEnrollCard
            qrCode={qrCode}
            secret={secret}
            uri={uri}
            code={code}
            onCodeChange={setCode}
            onVerify={handleVerify}
            verifying={verifying || enrolling || issuing}
          />

          <div className="flex items-center justify-between text-body-sm">
            <button
              type="button"
              onClick={changeMethod}
              className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium"
            >
              <Trans>Use an email code instead</Trans>
            </button>
            <p className="text-caption text-ktip-sand-500 text-right">
              {/* GoTrue signs other sessions out when a factor is verified. Better
                  said here than discovered on another device. */}
              <Trans>Finishing this signs you out anywhere else you are logged in.</Trans>
            </p>
          </div>
        </div>
      )}

      {method === 'email' && (
        <EmailCodeCard
          email={auth.user.email}
          userId={auth.user.id}
          mode="setup"
          onVerified={handleEmailVerified}
          onSwitchToApp={() => {
            setPicked('totp')
            setMethod('totp')
          }}
        />
      )}

      {onSheet && codes && (
        <BackupCodesSheet
          codes={codes}
          accountEmail={auth.user.email}
          confirmLabel={t`Finish and go to KTIP`}
          onConfirm={() => {
            toast.success(t`Two-step verification is on.`)
            navigate('/', { replace: true })
          }}
          confirming={issuing}
        />
      )}
    </AuthSplitShell>
  )
}
