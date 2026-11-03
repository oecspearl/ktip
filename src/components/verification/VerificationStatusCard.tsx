import { useState } from 'react'
import { Link } from 'react-router'
import { BadgeCheck, CalendarClock, History, MailCheck, ShieldOff } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { CollapsibleSection } from '../ui/CollapsibleSection'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useSendEmailProof } from '../../hooks/useEmailVerification'
import {
  useMyVerificationHistory,
  type MyVerificationEvent,
  type MyVerificationStatus,
} from '../../hooks/useVerificationLifecycle'
import { formatDate } from '../../lib/utils'
import { inRenewalWindow } from '../../lib/verification-term'
import { RedeemCodeCard } from './RedeemCodeCard'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * What the member sees once 174–176 are live: how the badge was earned,
 * when it ends, how to renew it, and what happened to it if it was removed.
 * Renders nothing when the status RPC is not deployed yet.
 */
export function VerificationStatusCard({ status }: { status: MyVerificationStatus }) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { sendProof, loading: sending } = useSendEmailProof()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [devLink, setDevLink] = useState<string | undefined>()

  const nearEnd = inRenewalWindow(status.verified_until)

  const renewByEmail = async () => {
    if (!status.renew_email) return
    try {
      const r = await sendProof({ email: status.renew_email, purpose: 'renewal' })
      if (r.status === 'sent') {
        setSentTo(status.renew_email)
        setDevLink(r.dev_link)
      } else if (r.status === 'domain_not_recognised') {
        toast.error(t`@${r.domain} no longer verifies accounts on KTIP. Use a code or an identity document instead.`)
      } else {
        toast.success(t`Your verification is up to date.`)
      }
    } catch (err: any) {
      toast.error(err.message || t`Could not send the confirmation email`)
    }
  }

  if (status.on_hold) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
            <ShieldOff size={20} className="text-red-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">
              <Trans>A reviewer removed your verified badge</Trans>
            </h2>
            <p className="text-sm text-ktip-sand-600 mt-1">
              <Trans>
                Until a reviewer restores it, email addresses and codes cannot verify this account.
                The reason is in your notifications and in the history below.
              </Trans>
            </p>
            <p className="text-sm text-ktip-sand-600 mt-2">
              <Link to="/legal/verification#review" className="text-ktip-ocean-600 underline">
                <Trans>How to ask for a review</Trans>
              </Link>
            </p>
          </div>
        </div>
        <HistoryList userId={auth.user?.id} />
      </Card>
    )
  }

  if (status.lapsed) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-ktip-sun-100 rounded-xl flex items-center justify-center shrink-0">
            <CalendarClock size={20} className="text-ktip-sun-700" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">
              <Trans>Your verified badge has ended</Trans>
            </h2>
            <p className="text-sm text-ktip-sand-600 mt-1">
              {status.label ? (
                <Trans>It came from {status.label} and lasted 12 months. Renew it, or verify another way below.</Trans>
              ) : (
                <Trans>It lasted 12 months. Renew it, or verify another way below.</Trans>
              )}
            </p>
            {status.renew_method === 'email' && status.renew_email && (
              <RenewByEmail
                email={status.renew_email}
                sentTo={sentTo}
                devLink={devLink}
                loading={sending}
                onRenew={renewByEmail}
              />
            )}
            {status.renew_method === 'code' && (
              <div className="mt-4">
                <RedeemCodeCard compact />
              </div>
            )}
          </div>
        </div>
      </Card>
    )
  }

  if (!status.verified) return null

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-ktip-tropical-100 rounded-xl flex items-center justify-center shrink-0">
          <BadgeCheck size={20} className="text-ktip-tropical-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">
            <Trans>Your account is verified</Trans>
          </h2>
          <p className="text-sm text-ktip-sand-600">{describeVia(status, t)}</p>

          {status.verified_until && (
            <p className={`text-sm mt-2 ${nearEnd ? 'text-ktip-sun-800 font-medium' : 'text-ktip-sand-600'}`}>
              {nearEnd ? (
                <Trans>Ends on {formatDate(status.verified_until)}. Renew it to keep posting and applying.</Trans>
              ) : (
                <Trans>Valid until {formatDate(status.verified_until)}.</Trans>
              )}
            </p>
          )}

          {status.verified_until && status.renew_method === 'email' && status.renew_email && (
            <RenewByEmail
              email={status.renew_email}
              sentTo={sentTo}
              devLink={devLink}
              loading={sending}
              onRenew={renewByEmail}
              quiet={!nearEnd}
            />
          )}
          {status.verified_until && status.renew_method === 'code' && nearEnd && (
            <div className="mt-4">
              <p className="text-sm text-ktip-sand-600 mb-2">
                <Trans>Ask your organisation for a new code and enter it here.</Trans>
              </p>
              <RedeemCodeCard compact />
            </div>
          )}
        </div>
      </div>
      <HistoryList userId={auth.user?.id} />
    </Card>
  )
}

function describeVia(status: MyVerificationStatus, t: ReturnType<typeof useLingui>['t']): string {
  const label = status.label
  switch (status.via) {
    case 'document':
      return t`Verified from the identity documents you submitted.`
    case 'domain':
      return label ? t`Verified by your ${label} email address.` : t`Verified by your organisation's email domain.`
    case 'institution':
    case 'roster':
      return label ? t`Verified through ${label}.` : t`Verified through your institution.`
    case 'org_code':
      return label ? t`Verified with a code from ${label}.` : t`Verified with a code from your organisation.`
    case 'association':
      return label ? t`Verified through your business, ${label}.` : t`Verified through your business.`
    case 'admin':
      return t`Verified by a KTIP administrator.`
    default:
      return t`Your profile shows the verified badge.`
  }
}

function RenewByEmail({
  email,
  sentTo,
  devLink,
  loading,
  onRenew,
  quiet = false,
}: {
  email: string
  sentTo: string | null
  devLink?: string
  loading: boolean
  onRenew: () => void
  quiet?: boolean
}) {
  if (sentTo) {
    return (
      <div className="mt-3 flex items-start gap-2 p-3 rounded-xl border bg-ktip-sun-50 border-ktip-sun-200 text-ktip-sun-800 text-sm" role="status">
        <MailCheck size={18} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-medium"><Trans>Check {sentTo}.</Trans></p>
          <p className="mt-0.5"><Trans>Open the email and press Confirm. The link works for 24 hours.</Trans></p>
          {devLink && (
            <p className="text-xs mt-2 break-all">
              <Trans>Development link:</Trans>{' '}
              <a className="underline" href={devLink}>{devLink}</a>
            </p>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button size="sm" variant={quiet ? 'outline' : 'primary'} onClick={onRenew} loading={loading}>
        <Trans>Renew now</Trans>
      </Button>
      <span className="text-xs text-ktip-sand-500">
        <Trans>We email {email} a link to confirm you are still there.</Trans>
      </span>
    </div>
  )
}

function eventLabel(e: MyVerificationEvent, t: ReturnType<typeof useLingui>['t']): string {
  switch (e.event) {
    case 'granted':
      return t`Verified`
    case 'renewed':
      return t`Renewed`
    case 'track_changed':
      return t`Verification route changed`
    case 'rejected':
      return t`Document not accepted`
    case 'revoked':
      return t`Badge removed by a reviewer`
    case 'expired':
      return t`Badge ended (not renewed)`
    case 'code_redeemed':
      return t`Code from your organisation used`
    case 'code_withdrawn':
      return t`Your organisation withdrew its code`
    case 'hold_set':
      return t`Automatic verification paused`
    case 'hold_cleared':
      return t`Pause lifted`
    default:
      return e.event
  }
}

function HistoryList({ userId }: { userId: string | undefined }) {
  const { t } = useLingui()
  const { history } = useMyVerificationHistory(userId)
  if (!history || history.length === 0) return null
  return (
    <div className="mt-5 pt-4 border-t border-ktip-sand-100">
      <CollapsibleSection
        title={t`History`}
        icon={<History size={16} className="text-ktip-ocean-600" />}
        defaultOpen={false}
      >
        <ul className="space-y-2">
          {history.map((e, i) => (
            <li key={`${e.created_at}-${i}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-ktip-sand-800">{eventLabel(e, t)}</span>
                <span className="text-xs text-ktip-sand-500 shrink-0">{formatDate(e.created_at)}</span>
              </div>
              {e.reason && <p className="text-xs text-ktip-sand-600 mt-0.5">{e.reason}</p>}
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  )
}

export default VerificationStatusCard
