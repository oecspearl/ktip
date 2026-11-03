import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Ban, Copy, KeyRound, Plus, UserMinus } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Modal } from '../ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  useIssueVerificationCode,
  useMyCodeIssuingOrgs,
  useOrgVerificationCodes,
  useRevokeVerificationCode,
  useWithdrawOrgVouch,
  type CodeStatus,
  type IssuingOrg,
  type OrgCode,
} from '../../hooks/useVerificationLifecycle'
import { formatDate } from '../../lib/utils'
import { ROLE_LABELS } from '../../lib/constants'
import { resolveCopy } from '../../i18n/copy'
import { Trans, useLingui } from '@lingui/react/macro'

const SELECT_CLASS =
  'border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-hidden focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500'

/**
 * Verification codes for the organisations this member administers (176).
 * Renders nothing for anyone who administers none, and nothing before the
 * migration is applied.
 *
 * Pass `orgId` to show one organisation only (the Business tab does).
 */
export function OrgCodesPanel({ orgId }: { orgId?: string }) {
  const auth = useAuth()
  const { orgs } = useMyCodeIssuingOrgs(auth.user?.id)
  const visible = (orgs ?? []).filter((o) => !orgId || o.org_id === orgId)
  if (visible.length === 0) return null

  return (
    <div className="space-y-6">
      {visible.map((org) => (
        <OrgCodesCard key={`${org.org_kind}:${org.org_id}`} org={org} />
      ))}
    </div>
  )
}

function OrgCodesCard({ org }: { org: IssuingOrg }) {
  const { t, i18n } = useLingui()
  const toast = useToast()
  const { codes, loading } = useOrgVerificationCodes(org.org_kind, org.org_id)
  const { issue, loading: issuing } = useIssueVerificationCode()
  const { revokeCode } = useRevokeVerificationCode()
  const { withdraw, loading: withdrawing } = useWithdrawOrgVouch()

  const [formOpen, setFormOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [days, setDays] = useState('14')
  const [issued, setIssued] = useState<{ code: string; label: string; expires: string } | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<OrgCode | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')

  const issueFailure: Record<string, string> = {
    issuer_unverified: t`Verify your own account before issuing codes.`,
    org_unverified: t`This organisation is not verified, so it cannot issue codes.`,
    role_not_allowed: t`That role cannot be given with a code.`,
    forbidden: t`You are not allowed to issue this kind of code here.`,
    label_required: t`Say who the code is for.`,
    bad_email: t`Enter a valid email address, or leave it empty.`,
    too_many_open: t`This organisation already has 25 unused codes. Cancel some first.`,
    rate_limited: t`You have issued 50 codes today. Try again tomorrow.`,
  }

  const roleName = (slug: string) => resolveCopy(i18n, ROLE_LABELS[slug] ?? slug)

  const handleIssue = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const r = await issue({
        kind: org.org_kind,
        orgId: org.org_id,
        label: label.trim(),
        intendedEmail: email.trim() || undefined,
        grantsRole: role || undefined,
        validDays: Number(days) || 14,
      })
      if (!r.ok || !r.code) {
        toast.error(issueFailure[r.reason ?? ''] || t`The code could not be issued.`)
        return
      }
      setIssued({ code: r.code, label: label.trim(), expires: r.expires_at ?? '' })
      setLabel('')
      setEmail('')
      setRole('')
      setFormOpen(false)
    } catch (err: any) {
      toast.error(err.message || t`The code could not be issued.`)
    }
  }

  const handleCancel = async (code: OrgCode) => {
    try {
      const r = await revokeCode(code.id)
      if (!r.ok) toast.error(t`That code can no longer be cancelled.`)
      else toast.success(t`Code cancelled`)
    } catch (err: any) {
      toast.error(err.message || t`Could not cancel the code`)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawTarget?.redeemed_by) return
    try {
      const r = await withdraw({ userId: withdrawTarget.redeemed_by, reason: withdrawReason.trim() })
      if (!r.ok) {
        toast.error(
          r.reason === 'reason_required'
            ? t`Give a reason of at least 10 characters. The member sees it.`
            : t`This member's badge no longer rests on your code.`
        )
        return
      }
      toast.success(t`Badge withdrawn`)
      setWithdrawTarget(null)
      setWithdrawReason('')
    } catch (err: any) {
      toast.error(err.message || t`Could not withdraw the badge`)
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t`Copied`)
    } catch {
      toast.error(t`Copy failed. Select the code and copy it by hand.`)
    }
  }

  const statusChip: Record<CodeStatus, { label: string; cls: string }> = {
    unused: { label: t`Unused`, cls: 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200' },
    redeemed: { label: t`Used`, cls: 'bg-ktip-tropical-100 text-ktip-tropical-800 border-ktip-tropical-200' },
    expired: { label: t`Expired`, cls: 'bg-ktip-sand-100 text-ktip-sand-600 border-ktip-sand-200' },
    revoked: { label: t`Cancelled`, cls: 'bg-ktip-sand-100 text-ktip-sand-600 border-ktip-sand-200' },
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-ktip-ocean-100 rounded-xl flex items-center justify-center shrink-0">
            <KeyRound size={20} className="text-ktip-ocean-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold text-ktip-sand-900">
              <Trans>Verification codes for {org.org_name}</Trans>
            </h2>
            <p className="text-sm text-ktip-sand-600">
              <Trans>Vouch for people who work or study with you but have no work email.</Trans>
            </p>
          </div>
        </div>
        {!formOpen && (
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setFormOpen(true)}>
            <Trans>New code</Trans>
          </Button>
        )}
      </div>

      <p className="text-xs text-ktip-sand-500 mb-4">
        <Trans>
          Each code works once. Hand it to one person you know, and withdraw their badge when they
          leave.
        </Trans>{' '}
        <Link to="/legal/verification#organisation-codes" className="text-ktip-ocean-600 underline">
          <Trans>What issuing a code means</Trans>
        </Link>
      </p>

      {formOpen && (
        <form onSubmit={handleIssue} className="space-y-3 p-4 mb-4 rounded-xl border border-ktip-sand-200 bg-ktip-sand-50/50">
          <Input
            label={t`Who is it for?`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t`Name and job, e.g. Jane Charles, field officer`}
            maxLength={120}
            required
            fullWidth
          />
          <Input
            label={t`Their email (optional)`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            fullWidth
          />
          <p className="text-xs text-ktip-sand-500 -mt-1">
            <Trans>If you fill this in, only an account with that confirmed address can use the code.</Trans>
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-label font-medium text-ktip-sand-700">
              <Trans>Role</Trans>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={SELECT_CLASS}>
                <option value="">{t`Badge only`}</option>
                {org.allowed_roles.map((r) => (
                  <option key={r} value={r}>{roleName(r)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-label font-medium text-ktip-sand-700">
              <Trans>Valid for</Trans>
              <select value={days} onChange={(e) => setDays(e.target.value)} className={SELECT_CLASS}>
                <option value="3">{t`3 days`}</option>
                <option value="7">{t`7 days`}</option>
                <option value="14">{t`14 days`}</option>
                <option value="30">{t`30 days`}</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button type="submit" size="sm" loading={issuing} disabled={!label.trim()}>
              <Trans>Create code</Trans>
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
      ) : codes.length === 0 ? (
        <p className="text-sm text-ktip-sand-500"><Trans>No codes yet.</Trans></p>
      ) : (
        <ul className="divide-y divide-ktip-sand-100">
          {codes.map((code) => {
            const chip = statusChip[code.status]
            return (
              <li key={code.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ktip-sand-900 truncate">{code.label}</p>
                  <p className="text-xs text-ktip-sand-500">
                    <span className="font-mono">…{code.code_hint}</span>
                    {code.grants_role ? ` · ${roleName(code.grants_role)}` : ''}
                    {' · '}
                    {code.status === 'redeemed' && code.redeemed_at
                      ? t`used by ${code.redeemed_by_name ?? t`a member`} on ${formatDate(code.redeemed_at)}`
                      : t`issued ${formatDate(code.issued_at)}, expires ${formatDate(code.expires_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${chip.cls}`}>
                    {chip.label}
                  </span>
                  {code.status === 'unused' && (
                    <Button size="sm" variant="outline" icon={<Ban size={14} />} onClick={() => handleCancel(code)}>
                      <Trans>Cancel</Trans>
                    </Button>
                  )}
                  {code.member_verified && (
                    <Button size="sm" variant="outline" icon={<UserMinus size={14} />} onClick={() => setWithdrawTarget(code)}>
                      <Trans>Withdraw badge</Trans>
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {issued && (
        <Modal open onClose={() => setIssued(null)} title={t`Your new code`} size="md">
          <div className="space-y-4">
            <p className="text-sm text-ktip-sand-600">
              <Trans>For {issued.label}. Copy it now: it is not shown again.</Trans>
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-center text-lg font-mono tracking-wider bg-ktip-sand-50 border border-ktip-sand-200 rounded-lg px-3 py-3 select-all">
                {issued.code}
              </code>
              <Button variant="outline" icon={<Copy size={16} />} onClick={() => copy(issued.code)}>
                <Trans>Copy</Trans>
              </Button>
            </div>
            {issued.expires && (
              <p className="text-xs text-ktip-sand-500">
                <Trans>Works once, until {formatDate(issued.expires)}. They enter it under Settings, Verification.</Trans>
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setIssued(null)}><Trans>Done</Trans></Button>
            </div>
          </div>
        </Modal>
      )}

      {withdrawTarget && (
        <Modal open onClose={() => setWithdrawTarget(null)} title={t`Withdraw this badge?`} size="md">
          <div className="space-y-4">
            <p className="text-sm text-ktip-sand-600">
              <Trans>
                {withdrawTarget.redeemed_by_name ?? t`This member`} loses the verified badge your code gave
                them. They can verify again another way. Any role stays until a KTIP administrator removes it.
              </Trans>
            </p>
            <Textarea
              label={t`Reason (the member sees this)`}
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              placeholder={t`e.g. Left the company in October`}
              rows={3}
              fullWidth
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setWithdrawTarget(null)}>
                <Trans>Keep badge</Trans>
              </Button>
              <Button
                variant="danger"
                onClick={handleWithdraw}
                loading={withdrawing}
                disabled={withdrawReason.trim().length < 10}
              >
                <Trans>Withdraw badge</Trans>
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  )
}

export default OrgCodesPanel
