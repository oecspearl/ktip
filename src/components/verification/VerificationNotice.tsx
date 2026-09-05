import { Link } from 'react-router'
import { BadgeCheck, Clock, ShieldAlert } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useMyVerificationRequest } from '../../hooks/useVerification'
import { Trans, useLingui } from '@lingui/react/macro'

interface VerificationNoticeProps {
  /** What this page would let them do once verified, e.g. "apply for funding". */
  action: string
  className?: string
}

/**
 * Says why the create/apply control is missing.
 *
 * Migration 139 withholds the publishing and applying permissions until an
 * admin approves the account, and every CTA on the platform is already written
 * as `{auth.can('...') && <Button/>}` — so the gate takes effect with no page
 * changes at all. That is exactly the problem this component exists for: a
 * button that silently is not there reads as a broken page, not as a rule. The
 * gate has to announce itself where it bites.
 *
 * Renders nothing for a verified member, which is everyone once they are
 * through the queue, so it costs a signed-in reader nothing after day one.
 */
export function VerificationNotice({ action, className }: VerificationNoticeProps) {
  const { t } = useLingui()
  const auth = useAuth()
  const { request } = useMyVerificationRequest(auth.user?.id)

  // Signed out is a different conversation — that is what the sign-in prompts
  // are for, and telling a visitor about a verification queue they cannot join
  // yet only adds a step.
  if (!auth.user || auth.verified) return null

  const pending = request?.status === 'pending'
  const rejected = request?.status === 'rejected'

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        rejected
          ? 'border-red-200 bg-red-50'
          : pending
            ? 'border-ktip-ocean-200 bg-ktip-ocean-50'
            : 'border-ktip-sand-200 bg-ktip-cream'
      } ${className || ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-ktip-ocean-600">
          {rejected ? (
            <ShieldAlert size={20} className="text-red-600" />
          ) : pending ? (
            <Clock size={20} />
          ) : (
            <BadgeCheck size={20} />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-ktip-sand-900">
            {rejected ? (
              <Trans>Your verification was not approved</Trans>
            ) : pending ? (
              <Trans>Your verification is being reviewed</Trans>
            ) : (
              <Trans>Verify your account to {action}</Trans>
            )}
          </p>
          <p className="mt-0.5 text-sm text-ktip-sand-600">
            {rejected ? (
              <Trans>
                Read the reviewer's note, then send new documents. Everything on the platform stays
                readable in the meantime.
              </Trans>
            ) : pending ? (
              <Trans>
                You can keep browsing while it is checked. Posting, applying and messaging open as
                soon as it is approved.
              </Trans>
            ) : (
              <Trans>
                Browsing is open to everyone. Publishing, applying for funding and messaging other
                members need one identity check first.
              </Trans>
            )}
          </p>
        </div>
      </div>

      {!pending && (
        <Link to="/settings?tab=verification" className="shrink-0">
          <Button size="sm" variant={rejected ? 'danger' : undefined}>
            {rejected ? t`Send new documents` : t`Get verified`}
          </Button>
        </Link>
      )}
    </div>
  )
}
