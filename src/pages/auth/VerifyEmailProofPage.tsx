import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { keys } from '../../queries/keys'
import { Button } from '../../components/ui/Button'
import { AuthBackdrop } from '../../components/layout/AuthBackdrop'
import { BadgeCheck, Clock, MailWarning, ShieldCheck } from 'lucide-react'
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

interface Confirmed {
  email: string | null
  outcome: string
  label?: string
  institution?: string
  role?: string | null
  domain?: string
}

/**
 * Confirms a work or school address (migration 145).
 *
 * Nothing happens on mount — the user must click. Corporate link scanners and
 * mail-client prefetchers follow links automatically, and a page that
 * confirmed on load would let them verify accounts with nobody involved.
 */
export default function VerifyEmailProofPage() {
  const { t, i18n } = useLingui()
  usePageTitle(t`Confirm your work or school email`)
  const { token } = useParams()
  const auth = useAuth()
  const queryClient = useQueryClient()

  const [state, setState] = useState<'idle' | 'working' | 'ok' | 'failed'>('idle')
  const [reason, setReason] = useState('not_found')
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null)
  const submittedRef = useRef(false)

  const confirm = async () => {
    if (!token || submittedRef.current) return
    submittedRef.current = true
    setState('working')

    try {
      const res = await fetch('/api/verification/confirm-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok && body?.success) {
        setConfirmed({
          email: body.email ?? null,
          outcome: body.outcome ?? 'verified',
          label: body.label,
          institution: body.institution_name,
          role: body.granted_role ?? null,
          domain: body.domain,
        })
        setState('ok')
        queryClient.invalidateQueries({ queryKey: keys.all('email-proofs') })
        queryClient.invalidateQueries({ queryKey: ['profile'] })
        queryClient.invalidateQueries({ queryKey: ['permissions'] })
        queryClient.invalidateQueries({ queryKey: keys.all('student-safeguarding') })
        return
      }

      setReason(typeof body?.error === 'string' ? body.error : 'server_error')
      setState('failed')
    } catch {
      setReason('server_error')
      setState('failed')
    } finally {
      submittedRef.current = false
    }
  }

  const failure = FAILURE_COPY[reason] ?? FAILURE_COPY.not_found
  const verificationHref = '/dashboard/verification'
  const backLabel = auth.user ? t`Back to Verification` : t`Sign in`
  const backHref = auth.user ? verificationHref : '/login'

  const okCopy = (() => {
    if (!confirmed) return null
    switch (confirmed.outcome) {
      case 'verified':
      case 'already_verified':
        return {
          icon: <BadgeCheck size={28} className="text-ktip-tropical-700" />,
          tone: 'bg-ktip-tropical-100',
          title: t`Your account is verified`,
          body: confirmed.label
            ? t`${confirmed.email ?? 'This address'} belongs to ${confirmed.label}, which verifies your KTIP account. Your profile now shows the badge.`
            : t`${confirmed.email ?? 'This address'} verifies your KTIP account. Your profile now shows the badge.`,
        }
      case 'student_approved':
      case 'already_member':
        return {
          icon: <BadgeCheck size={28} className="text-ktip-tropical-700" />,
          tone: 'bg-ktip-tropical-100',
          title: t`Approved by your institution`,
          body: confirmed.institution
            ? t`${confirmed.institution} recognised ${confirmed.email ?? 'this address'}. Your account is verified and holds the student role.`
            : t`Your institution recognised this address. Your account is verified and holds the student role.`,
        }
      case 'student_pending':
        return {
          icon: <Clock size={28} className="text-ktip-sun-700" />,
          tone: 'bg-ktip-sun-100',
          title: t`Address confirmed — waiting on your institution`,
          body: confirmed.institution
            ? t`${confirmed.institution} owns this email domain. An educator there approves the request, and that approval is what verifies you.`
            : t`Your institution owns this email domain. An educator there approves the request, and that approval is what verifies you.`,
        }
      default:
        return {
          icon: <MailWarning size={28} className="text-ktip-sun-700" />,
          tone: 'bg-ktip-sun-100',
          title: t`Address confirmed, but not recognised`,
          body: t`@${confirmed.domain ?? ''} is not a trusted organisation or partner institution yet. Upload an identity document from Settings instead.`,
        }
    }
  })()

  return (
    <AuthBackdrop>
      <div className="bg-ktip-cream rounded-lg p-8 w-full max-w-md mx-auto shadow-lg text-center">
        {state === 'ok' && okCopy ? (
          <>
            <div className={`w-14 h-14 ${okCopy.tone} rounded-full flex items-center justify-center mx-auto mb-4`}>
              {okCopy.icon}
            </div>
            <h1 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">{okCopy.title}</h1>
            <p className="text-ktip-sand-600 mb-6">{okCopy.body}</p>
            <Link to={backHref}>
              <Button fullWidth>{backLabel}</Button>
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
            <Link to={backHref}>
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
              <Trans>
                Confirming proves that a KTIP account holder controls this work or school mailbox.
                It does not let this address sign in.
              </Trans>
            </p>
            <Button onClick={confirm} loading={state === 'working'} disabled={!token} fullWidth>
              <Trans>Confirm</Trans>
            </Button>
            <p className="mt-4 text-xs text-ktip-sand-500">
              <Trans>If you weren't expecting this email, close this page — nothing will be verified.</Trans>
            </p>
          </>
        )}
      </div>
    </AuthBackdrop>
  )
}
