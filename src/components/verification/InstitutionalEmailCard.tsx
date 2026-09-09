import { useState, type FormEvent, type ReactNode } from 'react'
import { BadgeCheck, Building2, Clock, GraduationCap, Mail, MailCheck, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  useClaimEmailVerification,
  useMyEmailProofs,
  useRemoveEmailProof,
  useSendEmailProof,
} from '../../hooks/useEmailVerification'
import { normaliseEmail } from '../../lib/email-domain'
import { formatDate } from '../../lib/utils'
import { ROLE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { Trans, useLingui } from '@lingui/react/macro'
import type { EmailVerificationResult } from '../../types'

type Outcome =
  | { kind: 'verified'; label?: string; role?: string | null }
  | { kind: 'student_approved'; institution?: string; role?: string | null }
  | { kind: 'student_pending'; institution?: string }
  | { kind: 'sent'; email: string; devLink?: string }
  | { kind: 'not_recognised'; domain: string }
  | { kind: 'unconfirmed' }

/**
 * The one button (migration 145): "Verify with a work or school email".
 *
 * The member types an address; the server decides what it is worth. The
 * primary address is already proven by Supabase, so it goes straight to the
 * decision. Any other address is mailed a link first.
 */
export function InstitutionalEmailCard() {
  const { t, i18n } = useLingui()
  const auth = useAuth()
  const toast = useToast()

  const primary = auth.user?.email?.toLowerCase() ?? ''
  const [email, setEmail] = useState(primary)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const { claim, loading: claiming } = useClaimEmailVerification()
  const { sendProof, loading: sending } = useSendEmailProof()
  const { proofs } = useMyEmailProofs(auth.user?.id)
  const { removeProof } = useRemoveEmailProof()

  const busy = claiming || sending

  const describeResult = (result: EmailVerificationResult): Outcome | null => {
    if (!result.ok) {
      if (result.reason === 'domain_not_recognised') {
        return { kind: 'not_recognised', domain: result.domain ?? email.split('@')[1] ?? '' }
      }
      if (result.reason === 'email_unconfirmed') return { kind: 'unconfirmed' }
      return null
    }
    switch (result.outcome) {
      case 'verified':
      case 'already_verified':
        return { kind: 'verified', label: result.label, role: result.granted_role ?? null }
      case 'student_approved':
      case 'already_member':
        return { kind: 'student_approved', institution: result.institution_name, role: result.granted_role ?? null }
      case 'student_pending':
        return { kind: 'student_pending', institution: result.institution_name }
      default:
        return null
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const normalised = normaliseEmail(email)
    if (!normalised) {
      toast.error(t`Enter a valid email address.`)
      return
    }
    try {
      if (normalised === primary) {
        const result = await claim()
        const next = describeResult(result)
        if (!next) throw new Error(t`Verification could not be completed.`)
        setOutcome(next)
        return
      }
      const sent = await sendProof(normalised)
      if (sent.status === 'sent') {
        setOutcome({ kind: 'sent', email: normalised, devLink: sent.dev_link })
      } else if (sent.status === 'already_verified') {
        setOutcome(describeResult(sent.result))
      } else if (sent.status === 'domain_not_recognised') {
        setOutcome({ kind: 'not_recognised', domain: sent.domain })
      } else if (sent.status === 'use_primary') {
        const result = await claim()
        setOutcome(describeResult(result))
      }
    } catch (err: any) {
      toast.error(err.message || t`Verification could not be completed.`)
    }
  }

  const roleLabel = (slug?: string | null) =>
    slug ? resolveCopy(i18n, ROLE_LABELS[slug] ?? slug) : null

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center">
          <Mail size={20} className="text-ktip-ocean-600" />
        </div>
        <div>
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">
            <Trans>Verify with a work or school email</Trans>
          </h2>
          <p className="text-sm text-ktip-sand-600">
            <Trans>The fastest way. Nothing to upload, and usually nobody to wait for.</Trans>
          </p>
        </div>
      </div>

      <p className="text-sm text-ktip-sand-600 mb-4">
        <Trans>
          An address at a trusted organisation verifies your account on the spot. An address at
          a partner school or college links you to it as a student. Your sign-in address is
          checked immediately; any other address gets a confirmation email first.
        </Trans>
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <Input
          label={t`Work or school email`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@oecs.int"
          disabled={busy}
          fullWidth
        />
        <Button type="submit" loading={busy} disabled={!email.trim()} className="shrink-0">
          <Trans>Verify</Trans>
        </Button>
      </form>

      {outcome && (
        <div className="mt-4">
          {outcome.kind === 'verified' && (
            <Notice tone="good" icon={<BadgeCheck size={20} />}>
              <p className="font-medium"><Trans>Your account is verified.</Trans></p>
              <p className="text-sm mt-1">
                {outcome.label ? (
                  <Trans>Your {outcome.label} email address did it. </Trans>
                ) : null}
                {outcome.role ? (
                  <Trans>Your account now holds the {roleLabel(outcome.role)} role.</Trans>
                ) : null}
              </p>
            </Notice>
          )}
          {outcome.kind === 'student_approved' && (
            <Notice tone="good" icon={<GraduationCap size={20} />}>
              <p className="font-medium">
                {outcome.institution ? (
                  <Trans>{outcome.institution} approved your account.</Trans>
                ) : (
                  <Trans>Your institution approved your account.</Trans>
                )}
              </p>
              <p className="text-sm mt-1">
                <Trans>
                  You are verified and now hold the {roleLabel(outcome.role ?? 'student')} role.
                </Trans>
              </p>
            </Notice>
          )}
          {outcome.kind === 'student_pending' && (
            <Notice tone="wait" icon={<Clock size={20} />}>
              <p className="font-medium">
                {outcome.institution ? (
                  <Trans>Request sent to {outcome.institution}.</Trans>
                ) : (
                  <Trans>Request sent to your institution.</Trans>
                )}
              </p>
              <p className="text-sm mt-1">
                <Trans>An educator there approves it, and that approval is what verifies you. You will be notified.</Trans>
              </p>
            </Notice>
          )}
          {outcome.kind === 'sent' && (
            <Notice tone="wait" icon={<MailCheck size={20} />}>
              <p className="font-medium"><Trans>Check {outcome.email}.</Trans></p>
              <p className="text-sm mt-1">
                <Trans>Open the email and press Confirm. The link works for 24 hours.</Trans>
              </p>
              {outcome.devLink && (
                <p className="text-xs mt-2 break-all">
                  <Trans>Development link:</Trans>{' '}
                  <a className="underline" href={outcome.devLink}>{outcome.devLink}</a>
                </p>
              )}
            </Notice>
          )}
          {outcome.kind === 'not_recognised' && (
            <Notice tone="neutral" icon={<Building2 size={20} />}>
              <p className="font-medium">
                <Trans>@{outcome.domain} is not a partner domain yet.</Trans>
              </p>
              <p className="text-sm mt-1">
                <Trans>
                  If your organisation or school should be recognised, ask them to register on
                  KTIP. Otherwise, upload an identity document below.
                </Trans>
              </p>
            </Notice>
          )}
          {outcome.kind === 'unconfirmed' && (
            <Notice tone="neutral" icon={<Mail size={20} />}>
              <p className="font-medium"><Trans>Confirm your sign-in email first.</Trans></p>
              <p className="text-sm mt-1">
                <Trans>Open the confirmation email KTIP sent when you signed up, then try again.</Trans>
              </p>
            </Notice>
          )}
        </div>
      )}

      {proofs.length > 0 && (
        <div className="mt-5 pt-4 border-t border-ktip-sand-100">
          <p className="text-xs font-medium text-ktip-sand-500 mb-2">
            <Trans>Addresses you have confirmed</Trans>
          </p>
          <ul className="space-y-2">
            {proofs.map((proof) => (
              <li key={proof.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex items-center gap-2">
                  {proof.verified_at ? (
                    <BadgeCheck size={16} className="text-ktip-tropical-600 shrink-0" />
                  ) : (
                    <Clock size={16} className="text-ktip-sun-600 shrink-0" />
                  )}
                  <span className="truncate text-ktip-sand-800">{proof.email}</span>
                  <span className="text-xs text-ktip-sand-500 shrink-0">
                    {proof.verified_at
                      ? t`confirmed ${formatDate(proof.verified_at)}`
                      : t`awaiting confirmation`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeProof(proof.id).catch(() => toast.error(t`Could not remove it`))}
                  className="p-1 text-ktip-sand-400 hover:text-red-600 transition-colors shrink-0"
                  title={t`Remove`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ktip-sand-500 mt-2">
            <Trans>Removing an address does not remove a badge it already earned.</Trans>
          </p>
        </div>
      )}
    </Card>
  )
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'good' | 'wait' | 'neutral'
  icon: ReactNode
  children: ReactNode
}) {
  const tones = {
    good: 'bg-ktip-tropical-50 border-ktip-tropical-200 text-ktip-tropical-800',
    wait: 'bg-ktip-sun-50 border-ktip-sun-200 text-ktip-sun-800',
    neutral: 'bg-ktip-sand-50 border-ktip-sand-200 text-ktip-sand-800',
  }
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${tones[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export default InstitutionalEmailCard
