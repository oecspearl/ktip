import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { keys } from '../../queries/keys'
import { Button } from '../../components/ui/Button'
import { AuthBackdrop } from '../../components/layout/AuthBackdrop'
import { CheckCircle, MailWarning, ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

const FAILURE_COPY: Record<string, { title: MessageDescriptor; body: MessageDescriptor }> = {
  not_found: {
    title: msg`Link already used, or not valid`,
    body: msg`Confirmation links work once. If you have already confirmed this address, you are all set — otherwise request a fresh link from Settings.`,
  },
  expired: {
    title: msg`Confirmation link expired`,
    body: msg`These links are valid for 24 hours. Open Settings and send yourself a new one.`,
  },
  email_taken: {
    title: msg`Address no longer available`,
    body: msg`Someone registered a KTIP account with this address after the link was sent, so it can no longer be used as a secondary email.`,
  },
  invalid_token: {
    title: msg`Link is malformed`,
    body: msg`Copy the full address from the email — some mail clients break long links across lines.`,
  },
  rate_limited: {
    title: msg`Too many attempts`,
    body: msg`Wait an hour and try the link again.`,
  },
  server_error: {
    title: msg`Something went wrong`,
    body: msg`Try the link again in a moment.`,
  },
}

/**
 * Confirms a secondary email address.
 *
 * Nothing happens on mount — the user must click. That is deliberate: corporate
 * link scanners and mail-client prefetchers follow links automatically, and a
 * page that confirmed on load would let them verify addresses with no human
 * involved, which defeats the point of verifying.
 */
export default function VerifyEmailAliasPage() {
    const { t, i18n } = useLingui()
  usePageTitle(t`Confirm email address`)
  const { token } = useParams()
  const auth = useAuth()
  const queryClient = useQueryClient()

  const [state, setState] = useState<'idle' | 'working' | 'ok' | 'failed'>('idle')
  const [reason, setReason] = useState('not_found')
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null)
  const submittedRef = useRef(false)

  const confirm = async () => {
    if (!token || submittedRef.current) return
    submittedRef.current = true
    setState('working')

    try {
      const res = await fetch('/api/auth/verify-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok && body?.success) {
        setConfirmedEmail(body.email ?? null)
        setState('ok')
        queryClient.invalidateQueries({ queryKey: keys.all('email-alias') })
        return
      }

      setReason(typeof body?.error === 'string' ? body.error : 'server_error')
      setState('failed')
    } catch {
      setReason('server_error')
      setState('failed')
    } finally {
      // Allow a retry after a transport failure; a consumed token just 404s.
      submittedRef.current = false
    }
  }

  const failure = FAILURE_COPY[reason] ?? FAILURE_COPY.not_found
  const addressLabel = confirmedEmail ? <strong>{confirmedEmail}</strong> : t`This address`

  return (
    <AuthBackdrop>
      <div className="bg-ktip-cream rounded-lg p-8 w-full max-w-md mx-auto shadow-lg text-center">
        {state === 'ok' ? (
          <>
            <div className="w-14 h-14 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-ktip-tropical-700" />
            </div>
            <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              <Trans>Address confirmed</Trans>
            </h1>
            <p className="text-ktip-sand-600 mb-6">
              <Trans>
                {addressLabel} can now sign in to your KTIP account with the same password, and can
                be used to recover it.
              </Trans>
            </p>
            <Link to={auth.user ? '/settings?tab=security' : '/login'}>
              <Button fullWidth>{auth.user ? t`Back to Settings` : t`Sign in`}</Button>
            </Link>
          </>
        ) : state === 'failed' ? (
          <>
            <div className="w-14 h-14 bg-ktip-sun-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailWarning size={28} className="text-ktip-sun-700" />
            </div>
            <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              {i18n._(failure.title)}
            </h1>
            <p className="text-ktip-sand-600 mb-6">{i18n._(failure.body)}</p>
            <Link to={auth.user ? '/settings?tab=security' : '/login'}>
              <Button variant="secondary" fullWidth>
                {auth.user ? t`Open Settings` : t`Sign in`}
              </Button>
            </Link>
          </>
        ) : (
          <>
            <div className="w-14 h-14 bg-ktip-ocean-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={28} className="text-ktip-ocean-600" />
            </div>
            <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              <Trans>Confirm this email address</Trans>
            </h1>
            <p className="text-ktip-sand-600 mb-6">
              <Trans>Confirming links this address to a KTIP account as a secondary email. It will then be able to sign in with that account's password.</Trans>
            </p>
            <Button onClick={confirm} loading={state === 'working'} disabled={!token} fullWidth>
              <Trans>Confirm</Trans>
            </Button>
            <p className="mt-4 text-xs text-ktip-sand-500">
              <Trans>If you weren't expecting this email, close this page — nothing will be linked.</Trans>
            </p>
          </>
        )}
      </div>
    </AuthBackdrop>
  )
}
