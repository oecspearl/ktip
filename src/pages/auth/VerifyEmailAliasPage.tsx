import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { keys } from '../../queries/keys'
import { Button } from '../../components/ui/Button'
import { AuthBackdrop } from '../../components/layout/AuthBackdrop'
import { CheckCircle, MailWarning, ShieldCheck } from 'lucide-react'

const FAILURE_COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'Link already used, or not valid',
    body: 'Confirmation links work once. If you have already confirmed this address, you are all set — otherwise request a fresh link from Settings.',
  },
  expired: {
    title: 'Confirmation link expired',
    body: 'These links are valid for 24 hours. Open Settings and send yourself a new one.',
  },
  email_taken: {
    title: 'Address no longer available',
    body: 'Someone registered a KTIP account with this address after the link was sent, so it can no longer be used as a secondary email.',
  },
  invalid_token: {
    title: 'Link is malformed',
    body: 'Copy the full address from the email — some mail clients break long links across lines.',
  },
  rate_limited: {
    title: 'Too many attempts',
    body: 'Wait an hour and try the link again.',
  },
  server_error: {
    title: 'Something went wrong',
    body: 'Try the link again in a moment.',
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
  usePageTitle('Confirm email address')
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

  return (
    <AuthBackdrop>
      <div className="bg-ktip-cream rounded-lg p-8 w-full max-w-md mx-auto shadow-lg text-center">
        {state === 'ok' ? (
          <>
            <div className="w-14 h-14 bg-ktip-tropical-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-ktip-tropical-700" />
            </div>
            <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Address confirmed
            </h1>
            <p className="text-ktip-sand-600 mb-6">
              {confirmedEmail ? <strong>{confirmedEmail}</strong> : 'This address'} can now sign
              in to your KTIP account with the same password, and can be used to recover it.
            </p>
            <Link to={auth.user ? '/settings?tab=security' : '/login'}>
              <Button fullWidth>{auth.user ? 'Back to Settings' : 'Sign in'}</Button>
            </Link>
          </>
        ) : state === 'failed' ? (
          <>
            <div className="w-14 h-14 bg-ktip-sun-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailWarning size={28} className="text-ktip-sun-700" />
            </div>
            <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              {failure.title}
            </h1>
            <p className="text-ktip-sand-600 mb-6">{failure.body}</p>
            <Link to={auth.user ? '/settings?tab=security' : '/login'}>
              <Button variant="secondary" fullWidth>
                {auth.user ? 'Open Settings' : 'Sign in'}
              </Button>
            </Link>
          </>
        ) : (
          <>
            <div className="w-14 h-14 bg-ktip-ocean-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={28} className="text-ktip-ocean-600" />
            </div>
            <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              Confirm this email address
            </h1>
            <p className="text-ktip-sand-600 mb-6">
              Confirming links this address to a KTIP account as a secondary email. It will then
              be able to sign in with that account's password.
            </p>
            <Button onClick={confirm} loading={state === 'working'} disabled={!token} fullWidth>
              Confirm
            </Button>
            <p className="mt-4 text-xs text-ktip-sand-500">
              If you weren't expecting this email, close this page — nothing will be linked.
            </p>
          </>
        )}
      </div>
    </AuthBackdrop>
  )
}
