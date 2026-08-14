import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RouteSplash } from '../../components/RouteSplash'
import { TotpEnrollCard } from '../../components/security/TotpEnrollCard'
import { BackupCodesSheet } from '../../components/security/BackupCodesSheet'
import { useMfaFactors, useMfaMutations } from '../../hooks/useMfa'
import { usePageTitle } from '../../hooks/usePageTitle'
import { analytics } from '../../hooks/useAnalytics'
import { APP_FULL_NAME } from '../../lib/constants'

/**
 * Two-factor enrolment (118). A bare route, deliberately outside the
 * ProtectedRoute subtree — inside it, the gate that sends people here would send
 * them here from here.
 *
 * All three signup paths converge on this one page: the email wizard navigates
 * here after the OTP, OAuth onboarding after the role is written, and Virtual
 * Campus arrives through ProtectedRoute without knowing this page exists. One
 * component, three entry points, which is what makes switching another role on
 * a config change rather than a code change.
 */
export default function MfaSetupPage() {
  const { t } = useLingui()
  usePageTitle(t`Set up two-step verification`)
  const auth = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { enroll, verify, issueCodes, enrolling, verifying, issuing } = useMfaMutations(auth.user?.id)
  const { enrolled } = useMfaFactors(auth.user?.id)

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
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !auth.user?.id) return
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
  }, [auth.user?.id, enroll, t])

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
  if (enrolled && !finishing.current) {
    return <Navigate to="/" replace />
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

  const steps = [
    { title: t`Authenticator`, caption: t`One more step. Then your account is yours alone.` },
    { title: t`Recovery codes`, caption: t`Keep these somewhere safe. They are your way back in.` },
  ]

  const onSheet = codes !== null

  return (
    <AuthSplitShell
      step={onSheet ? 2 : 1}
      steps={steps}
      heading={onSheet ? t`Save your recovery codes` : t`Set up two-step verification`}
      subheading={onSheet ? undefined : APP_FULL_NAME}
      heroOffset={5}
    >
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-5">
          {errorMessage}
        </div>
      )}

      {onSheet ? (
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
      ) : (
        <div className="space-y-5">
          <div className="flex gap-3 rounded-control border border-ktip-ocean-200 bg-ktip-ocean-50/50 p-4">
            <ShieldCheck size={20} className="text-ktip-ocean-600 shrink-0 mt-0.5" />
            <p className="text-body-sm text-ktip-sand-700">
              <Trans>
                Your account applies for funding, so it needs a second step at sign-in. You will
                need an authenticator app on your phone — it works offline and costs nothing.
              </Trans>
            </p>
          </div>

          <TotpEnrollCard
            qrCode={qrCode}
            secret={secret}
            uri={uri}
            code={code}
            onCodeChange={setCode}
            onVerify={handleVerify}
            verifying={verifying || enrolling || issuing}
          />

          <p className="text-caption text-ktip-sand-500 text-center">
            {/* GoTrue signs other sessions out when a factor is verified. Better
                said here than discovered on another device. */}
            <Trans>Finishing this signs you out anywhere else you are logged in.</Trans>
          </p>
        </div>
      )}
    </AuthSplitShell>
  )
}
