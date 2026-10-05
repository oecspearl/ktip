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
 * Send-and-type for the email second step (150). Asks for a code on mount,
 * offers a resend after a cooldown, verifies on the sixth digit.
 *
 * The mount request does not force a new email (159): if this session already
 * has a code on its way, the server says when it was sent and mails nothing.
 * Before that, every reload, second tab or remount mailed a fresh code and
 * killed the previous one, so the code the member found first — often late,
 * in spam — no longer worked. Only "Send a new code" forces.
 *
 * The field is never locked by a failed send (159). A refused request (rate
 * limit, mail outage) mints nothing, so whatever code the member already holds
 * is still good, and the screen has to let them type it.
 *
 * The same component serves enrolment and the sign-in challenge because they
 * are the same three actions; only the words around them change.
 */
export function EmailCodeCard({ email, userId, mode, onVerified, onSwitchToApp }: EmailCodeCardProps) {
  const { t, i18n } = useLingui()
  const { sendCode, verifyCode, sending, verifying, resendSeconds } = useMfaEmailMutations(userId)

  const [code, setCode] = useState('')
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [sendFailed, setSendFailed] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)

  // React 19 StrictMode runs effects twice in dev. The server would now reuse
  // the first code anyway, but there is no reason to ask twice.
  const started = useRef(false)

  const send = async (force: boolean) => {
    setErrorMessage('')
    try {
      const result = await sendCode({ force })
      setSentAt(result.sent_at)
      setSendFailed(false)
      // A reused code counts down from when it was really sent, so a reload
      // does not hold the resend button back for another full cooldown.
      const elapsed = Math.floor((Date.now() - new Date(result.sent_at).getTime()) / 1000)
      setResendIn(Math.max(0, resendSeconds - (Number.isFinite(elapsed) ? elapsed : 0)))
      setDevCode(result.dev_code ?? null)
      analytics.funnel('mfa', 'email_code_sent', { mode, reused: !!result.reused, forced: force })
    } catch (error: any) {
      setSendFailed(true)
      setErrorMessage(error?.message || t`We could not send a code. Try again in a moment.`)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void send(false)
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

  const masked = maskEmail(email)
  const sentTime = sentAt
    ? i18n.date(new Date(sentAt), { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-control border border-ktip-ocean-200 bg-ktip-ocean-50/50 p-4">
        <Mail size={20} className="text-ktip-ocean-600 shrink-0 mt-0.5" />
        <p className="text-body-sm text-ktip-sand-700">
          {sentTime ? (
            <Trans>
              We sent a 6-digit code to <strong>{masked}</strong> at {sentTime}. It works for 10
              minutes, in this browser only. Not in your inbox? Check spam.
            </Trans>
          ) : sendFailed ? (
            <Trans>
              Already have a code from an earlier email to <strong>{masked}</strong>? If it's
              less than 10 minutes old, it still works. Enter it below.
            </Trans>
          ) : (
            <Trans>
              Sending a 6-digit code to <strong>{masked}</strong>…
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
        disabled={verifying}
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
        disabled={code.length !== 6}
        onClick={() => handleVerify(code)}
      >
        {mode === 'setup' ? <Trans>Verify and turn on</Trans> : <Trans>Verify</Trans>}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
        <button
          type="button"
          onClick={() => void send(true)}
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
