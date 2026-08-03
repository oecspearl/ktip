import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { RESOURCE_SPECS } from '../hooks/useCollabInvites'
import { PageHero } from '../components/layout/PageHero'
import { Check, Loader2, MailWarning } from 'lucide-react'
import type { CollabResourceType } from '../types'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

export const PENDING_INVITE_KEY = 'ktip_pending_invite_token'

const FAILURE_COPY: Record<string, { title: MessageDescriptor; body: MessageDescriptor }> = {
  not_found: {
    title: msg`Invitation not found`,
    body: msg`This link is not valid. Ask whoever invited you to send a new one.`,
  },
  expired: {
    title: msg`Invitation expired`,
    body: msg`Invitations are valid for 14 days. Ask for a fresh one.`,
  },
  revoked: {
    title: msg`Invitation withdrawn`,
    body: msg`Whoever sent this invitation has since revoked it.`,
  },
  already_used: {
    title: msg`Invitation already used`,
    body: msg`This invitation has already been redeemed by another account.`,
  },
  wrong_account: {
    title: msg`Signed in as the wrong account`,
    body: msg`This invitation was sent to a different email address.`,
  },
  not_authenticated: {
    title: msg`Sign in to continue`,
    body: msg`Sign in or create your account, and we will bring you straight back here.`,
  },
}

/**
 * Redeems an emailed invitation token. The token is only ever sent to the
 * `redeem_email_invite` RPC — it grants nothing on its own, and the RPC checks
 * it against the signed-in account's email before creating the share.
 */
export default function JoinInvitePage() {
    const { t, i18n } = useLingui()
  usePageTitle(t`Join invitation`)
  const { token } = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const [state, setState] = useState<'working' | 'ok' | 'failed'>('working')
  const [reason, setReason] = useState<string>('not_found')
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)
  const redeemedRef = useRef(false)

  useEffect(() => {
    if (!token || auth.loading || redeemedRef.current) return

    // Not signed in yet: stash the token so the auth flow can bring them back.
    if (!auth.user) {
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, token)
      } catch {
        /* private mode — they can re-open the emailed link after signing in */
      }
      setReason('not_authenticated')
      setState('failed')
      return
    }

    redeemedRef.current = true
    void (async () => {
      const { data, error } = await (supabase as any).rpc('redeem_email_invite', { p_token: token })

      if (error || !data) {
        setReason('not_found')
        setState('failed')
        return
      }

      if (!data.ok) {
        setInvitedEmail(data.email ?? null)
        setReason(data.reason || 'not_found')
        setState('failed')
        return
      }

      try {
        sessionStorage.removeItem(PENDING_INVITE_KEY)
      } catch {
        /* nothing to clean up */
      }

      setState('ok')
      const type = data.resource_type as CollabResourceType | 'platform'
      const target =
        type === 'platform' || !data.resource_id
          ? '/collaborate'
          : RESOURCE_SPECS[type].href(data.resource_id)
      navigate(target, { replace: true })
    })()
  }, [token, auth.loading, auth.user, navigate])

  const copy = FAILURE_COPY[reason] ?? FAILURE_COPY.not_found

  return (
    <>
      <PageHero
        eyebrow={t`Invitation`}
        title={t`Join a collaboration`}
        imageSeed="invitations"
        compact
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Invitation` }]}
      />

      <div className="bg-ktip-sand-50 py-16">
        <div className="max-w-md mx-auto px-4 text-center">
          {state === 'working' && (
            <>
              <Loader2 size={32} className="mx-auto mb-4 animate-spin text-ktip-ocean-500" />
              <p className="text-ktip-sand-600"><Trans>Checking your invitation…</Trans></p>
            </>
          )}

          {state === 'ok' && (
            <>
              <Check size={32} className="mx-auto mb-4 text-ktip-tropical-600" />
              <p className="text-ktip-sand-600"><Trans>Invitation accepted — taking you there…</Trans></p>
            </>
          )}

          {state === 'failed' && (
            <>
              <MailWarning size={32} className="mx-auto mb-4 text-ktip-sun-600" />
              <h2 className="text-xl font-semibold text-ktip-sand-900 mb-2">{i18n._(copy.title)}</h2>
              <p className="text-ktip-sand-600 mb-2">{i18n._(copy.body)}</p>
              {invitedEmail && (
                <p className="text-sm text-ktip-sand-500 mb-6">
                  <Trans>
                    It was addressed to <span className="font-medium">{invitedEmail}</span>. Sign in
                    with that account to accept it.
                  </Trans>
                </p>
              )}

              <div className="flex items-center justify-center gap-3 mt-6">
                {reason === 'not_authenticated' ? (
                  <>
                    <Link
                      to="/login"
                      className="px-4 py-2 rounded-lg btn-brand text-sm font-medium"
                    >
                      <Trans>Sign in</Trans>
                    </Link>
                    <Link
                      to="/signup"
                      className="px-4 py-2 rounded-lg border border-ktip-sand-200 text-ktip-sand-700 hover:bg-ktip-sand-100 text-sm font-medium transition-colors"
                    >
                      <Trans>Create an account</Trans>
                    </Link>
                  </>
                ) : (
                  <Link
                    to="/collaborate"
                    className="px-4 py-2 rounded-lg btn-brand text-sm font-medium"
                  >
                    <Trans>Go to Collaborate</Trans>
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
