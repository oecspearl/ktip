import { useEffect, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Mail } from 'lucide-react'
import { Button } from '../ui/Button'
import { OtpInput } from '../ui/OtpInput'
import { maskEmail } from '../../lib/mfa'
import { useMfaEmailMutations, type EmailCodeVerifyResult } from '../../hooks/useMfa'
import { analytics } from '../../hooks/useAnalytics'

interface EmailCodeCardProps {
  /** The account address the code goes to. Display only — the server decides. */
  email: string | null | undefined
  userId?: string
  /** Set-up chooses the method; verify is the sign-in challenge. Copy differs. */
  mode: 'setup' | 'verify'
  onVerified: (result: EmailCodeVerifyResult) => void | Promise<void>
  /** Offered in set-up mode as the way back to the other method. */
  onSwitchToApp?: () => void
}

/**
 * Send-and-type for the email second step (150). Sends once on mount, offers
 * a resend after a cooldown, verifies on the sixth digit.
 *
 * The same component serves enrolment and the sign-in challenge because they
 * are the same three actions; only the words around them change.
 */
export function EmailCodeCard({ email, userId, mode, onVerified, onSwitchToApp }: EmailCodeCardProps) {
  const { t } = useLingui()
  const { sendCode, verifyCode, sending, verifying, resendSeconds } = useMfaEmailMutations(userId)

  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)

  // React 19 StrictMode runs effects twice in dev, and every send spends one
  // of five codes an hour — so the guard is the difference between one email
  // and two.
  const started = useRef(false)

  const send = async () => {
    setErrorMessage('')
    try {
      const result = await sendCode()
      setSent(true)
      setResendIn(resendSeconds)
      setDevCode(result.dev_code ?? null)
      analytics.funnel('mfa', 'email_code_sent', { mode })
    } catch (error: any) {
      setErrorMessage(error?.message || t`We could not send a code. Try again in a moment.`)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void send()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Counts the resend button down rather than letting the member press it and
  // get the rate limiter's refusal back as an error.
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  const handleVerify = async (submitted: string) => {
    if (submitted.length !== 6 || verifying) return
    setErrorMessage('')
    try {
      const result = await verifyCode(submitted)
      analytics.funnel('mfa', 'email_code_verified', { mode, first_time: result.first_time })
      await onVerified(result)
    } catch (error: any) {
      setCode('')
      setErrorMessage(error?.message || t`That code was not accepted. Check the digits, or send a new code.`)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-control border border-ktip-ocean-200 bg-ktip-ocean-50/50 p-4">
        <Mail size={20} className="text-ktip-ocean-600 shrink-0 mt-0.5" />
        <p className="text-body-sm text-ktip-sand-700">
          {sent ? (
            <Trans>
              We sent a 6-digit code to <strong>{maskEmail(email)}</strong>. It works for 10
              minutes. Check your spam folder if it has not arrived.
            </Trans>
          ) : (
            <Trans>
              Sending a 6-digit code to <strong>{maskEmail(email)}</strong>…
            </Trans>
          )}
        </p>
      </div>

      {devCode && (
        <p className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-caption text-amber-900">
          {/* Only ever present outside production, when Resend is not configured. */}
          Dev only — email is not configured, your code is <code className="font-mono">{devCode}</code>
        </p>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {errorMessage}
        </div>
      )}

      <OtpInput
        label={t`Code from your email`}
        value={code}
        onChange={setCode}
        onComplete={handleVerify}
        disabled={verifying || !sent}
        autoFocus
        helperText={
          mode === 'setup'
            ? t`Entering it turns on two-step verification by email for this account.`
            : undefined
        }
      />

      <Button
        type="button"
        fullWidth
        loading={verifying}
        disabled={code.length !== 6 || !sent}
        onClick={() => handleVerify(code)}
      >
        {mode === 'setup' ? <Trans>Verify and turn on</Trans> : <Trans>Verify</Trans>}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || resendIn > 0}
          className="text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium disabled:text-ktip-sand-400"
        >
          {resendIn > 0 ? (
            <Trans>Send a new code ({resendIn}s)</Trans>
          ) : (
            <Trans>Send a new code</Trans>
          )}
        </button>
        {onSwitchToApp && (
          <button
            type="button"
            onClick={onSwitchToApp}
            className="text-ktip-sand-500 hover:text-ktip-sand-700"
          >
            <Trans>Use an authenticator app instead</Trans>
          </button>
        )}
      </div>
    </div>
  )
}
