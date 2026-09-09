import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/admin/ConfirmModal'
import { ApplicationPreview } from '../../components/grants/application/ApplicationPreview'
import { DocumentsPanel } from '../../components/documents/DocumentsPanel'
import {
  useGrant,
  useFunderApplications,
  useDecideApplication,
  useRecordAward,
} from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { GRANT_APPLICATION_STATUS_COLORS, GRANT_APPLICATION_STATUS_LABELS } from '../../lib/constants'
import { formatCurrency, formatDate } from '../../lib/utils'
import { applicationTallies } from '../../lib/grant-metrics'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { Eye, CheckCircle, XCircle, Clock, Inbox, Banknote } from 'lucide-react'
import type { GrantApplication } from '../../types'
import { Trans, Plural, useLingui } from '@lingui/react/macro'

type Decision = 'under_review' | 'approved' | 'rejected'

const inputClass =
  'w-full px-3 py-2.5 border border-ktip-sand-200 bg-ktip-cream rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

const labelClass = 'block text-sm font-medium text-ktip-sand-700 mb-1'

/**
 * The applications to one funding call, for the funder who posted it.
 *
 * Migration 130 is what makes this page possible at all: before it, applications
 * were readable by their author and by `grant:manage`, so an OECS administrator
 * decided every application on the funder's behalf. The confidentiality
 * document has always said the named funder reads them — this is where that
 * happens.
 *
 * Drafts are absent by construction, not by a filter here: the funder's SELECT
 * policy excludes them, so an unsubmitted application cannot appear even as a
 * count.
 */
export default function GrantApplicationsPage() {
  const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()
  const toast = useToast()

  const { grant, loading: grantLoading } = useGrant(params.id)
  usePageTitle(grant?.title ? t`Applications — ${grant.title}` : t`Applications`)

  const { applications, loading, error: applicationsError, refetch } = useFunderApplications(grant?.id)
  const { decide, loading: deciding } = useDecideApplication()
  const { recordAward, loading: awarding } = useRecordAward()

  const [viewing, setViewing] = useState<GrantApplication | null>(null)
  const [rejecting, setRejecting] = useState<GrantApplication | null>(null)
  const [approving, setApproving] = useState<GrantApplication | null>(null)
  const [awardAmount, setAwardAmount] = useState('')
  const [awardCurrency, setAwardCurrency] = useState('')

  // The same pair migration 130 checks. RLS decides for real; this only stops
  // the page rendering an empty list to somebody who should not be here.
  const ownsGrant = !!grant && !!auth.user && grant.created_by === auth.user.id
  const canReview = ownsGrant ? auth.can('grant:post') : auth.can('grant:manage')

  /**
   * Whether this reviewer may put a figure on the decision.
   *
   * Approving and awarding are two permissions on purpose, and they do not
   * overlap neatly: 136 gave `grant:post` to ngo, research_institution,
   * educational_partner and private_sector, while `grant:manage_funds` sits
   * with investor, government, diaspora, igo, mentor and programme_supervisor.
   * An NGO funder therefore approves without recording an amount, and their
   * "Awarded" total stays an em dash. That is the permission catalog working —
   * recording the figure that lands in a World Bank report is a separate
   * responsibility from judging the proposal. Do not widen it here.
   */
  const canAward = auth.can('grant:manage_funds')

  const counts = useMemo(() => applicationTallies(applications), [applications])

  const applicantName = (application: GrantApplication) =>
    application.applicant?.display_name || t`An applicant`

  const record = async (application: GrantApplication, status: Decision) => {
    try {
      await decide(application.id, status)
      toast.success(
        status === 'approved'
          ? t`Application approved`
          : status === 'rejected'
            ? t`Application marked not accepted`
            : t`Application marked under review`
      )
      setRejecting(null)
      setApproving(null)
      setViewing(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || t`Could not record that decision`)
    }
  }

  const openApproval = (application: GrantApplication) => {
    setAwardAmount(application.awarded_amount != null ? String(application.awarded_amount) : '')
    setAwardCurrency(application.awarded_currency || grant?.currency || 'XCD')
    setApproving(application)
  }

  /**
   * Approve, with the awarded figure when one was typed.
   *
   * record_grant_award() sets `status = 'approved'` itself, so the two paths
   * are alternatives rather than a sequence — calling both would notify the
   * applicant twice for one decision.
   */
  const approve = async (application: GrantApplication) => {
    const typed = awardAmount.trim()
    if (!canAward || typed === '') {
      // Already approved and no figure typed: there is nothing to record, and
      // re-running the decision would notify the applicant again for nothing.
      if (application.status === 'approved') {
        toast.error(t`Enter the awarded amount to record it.`)
        return
      }
      await record(application, 'approved')
      return
    }

    const amount = Number(typed)
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error(t`Enter the awarded amount as a number, or leave it blank.`)
      return
    }

    try {
      await recordAward(application.id, amount, awardCurrency.trim().toUpperCase() || 'XCD')
      toast.success(t`Award recorded`)
      setApproving(null)
      setViewing(null)
      refetch()
    } catch (err: any) {
      const reasons: Record<string, string> = {
        forbidden: t`You do not have permission to record awards.`,
        not_your_call: t`That application is not to one of your funding calls.`,
        invalid_amount: t`Enter the awarded amount as a number, or leave it blank.`,
        not_found: t`That application no longer exists.`,
      }
      toast.error(reasons[err?.reason as string] || err.message || t`Could not record that award`)
    }
  }

  if (grantLoading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
      </div>
    )
  }

  if (!grant) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
        <p className="text-ktip-sand-600"><Trans>Grant not found.</Trans></p>
      </div>
    )
  }

  if (!canReview) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Not your funding call</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>Applications are read by the organisation that posted the call, and by grants administrators.</Trans>
        </p>
        <Button onClick={() => navigate('/grants')}>
          <Trans>Back to grants</Trans>
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Applications`}
        title={grant.title}
        subtitle={t`Everything submitted to this call. Drafts are never shown — an application appears here once the applicant submits it.`}
        image="/photos/keynote-1.webp"
        imageSeed="grants"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Grants`, href: '/grants' },
          { label: t`My Grants`, href: '/grants/my-grants' },
          { label: t`Applications` },
        ]}
      />

      <div data-spy-off className="w-full max-w-page mx-auto px-4 pt-8 pb-12">
        {applicationsError ? (
          <div className="text-center py-12">
            <p className="text-red-600"><Trans>Could not load applications.</Trans></p>
            <p className="mt-1 text-sm text-ktip-sand-600">{(applicationsError as Error).message}</p>
            <Button className="mt-4" variant="outline" onClick={() => refetch()}><Trans>Try again</Trans></Button>
          </div>
        ) : loading || !applications ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto" />
            <p className="mt-4 text-ktip-sand-600"><Trans>Loading applications...</Trans></p>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox size={32} className="text-gray-400" />
            </div>
            <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
              <Trans>No applications yet</Trans>
            </h3>
            <p className="text-gray-500">
              <Trans>Anything submitted to this call lands here. Drafts stay with the applicant.</Trans>
            </p>
          </div>
        ) : (
          <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg">
            <div className="px-4 py-3 border-b border-ktip-sand-200 flex flex-wrap items-center gap-3">
              <p className="text-sm text-ktip-sand-600">
                <Plural value={applications.length} one="# application" other="# applications" />
              </p>
              <div className="flex flex-wrap gap-2">
                {(['pending', 'under_review', 'approved', 'rejected'] as const).map((status) =>
                  counts[status] ? (
                    <Badge key={status} size="sm" className={GRANT_APPLICATION_STATUS_COLORS[status]}>
                      {counts[status]} {GRANT_APPLICATION_STATUS_LABELS[status]}
                    </Badge>
                  ) : null
                )}
              </div>
            </div>

            <ul className="divide-y divide-ktip-sand-100">
              {applications.map((application) => (
                <li
                  key={application.id}
                  className="px-4 py-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ktip-sand-900">
                      {applicantName(application)}
                    </p>
                    <p className="text-xs text-ktip-sand-500 mt-0.5">
                      <Trans>Submitted {formatDate(application.created_at)}</Trans>
                    </p>
                    {application.awarded_amount != null && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-ktip-tropical-700">
                        <Banknote size={12} />
                        <Trans>
                          Awarded{' '}
                          {formatCurrency(application.awarded_amount, application.awarded_currency)}
                        </Trans>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge size="sm" className={GRANT_APPLICATION_STATUS_COLORS[application.status]}>
                      {GRANT_APPLICATION_STATUS_LABELS[application.status] || application.status}
                    </Badge>

                    <button
                      type="button"
                      onClick={() => setViewing(application)}
                      className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                      title={t`Read the application`}
                    >
                      <Eye size={16} />
                    </button>

                    {application.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => record(application, 'under_review')}
                        disabled={deciding}
                        className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-50"
                        title={t`Mark under review`}
                      >
                        <Clock size={16} />
                      </button>
                    )}

                    {/* Still offered on an approved row when the reviewer can
                        award: the figure is often settled after the decision,
                        and correcting it should not mean un-approving first. */}
                    {(application.status !== 'approved' || canAward) && (
                      <button
                        type="button"
                        onClick={() => openApproval(application)}
                        className="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                        title={
                          application.status === 'approved' ? t`Record the award` : t`Approve`
                        }
                      >
                        {application.status === 'approved' ? (
                          <Banknote size={16} />
                        ) : (
                          <CheckCircle size={16} />
                        )}
                      </button>
                    )}

                    {application.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => setRejecting(application)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        title={t`Do not accept`}
                      >
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={t`Application`}
        description={viewing ? `${applicantName(viewing)} — ${grant.title}` : undefined}
        size="xl"
      >
        {viewing && (
          <div className="space-y-6">
            <ApplicationPreview
              title={applicantName(viewing)}
              grantTitle={grant.title}
              data={viewing.application_data || {}}
            />

            {/* Attachments read read-only: 130 gives the funder 'viewer' on an
                application's documents, never 'owner'. */}
            <DocumentsPanel
              entityType="grant_application"
              entityId={viewing.id}
              canEditEntity={false}
            />

            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-ktip-sand-100">
              {viewing.status !== 'rejected' && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<XCircle size={14} />}
                  onClick={() => setRejecting(viewing)}
                >
                  <Trans>Do Not Accept</Trans>
                </Button>
              )}
              {(viewing.status !== 'approved' || canAward) && (
                <Button
                  size="sm"
                  icon={
                    viewing.status === 'approved' ? <Banknote size={14} /> : <CheckCircle size={14} />
                  }
                  onClick={() => openApproval(viewing)}
                >
                  {viewing.status === 'approved' ? (
                    <Trans>Record Award</Trans>
                  ) : (
                    <Trans>Approve</Trans>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Approval carries the award figure, so it is a small form rather than a
          ConfirmModal. The amount stays optional: a funder who has decided but
          not yet settled the sum should not be blocked from approving, and a
          reviewer without grant:manage_funds never sees the fields at all. */}
      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        title={approving?.status === 'approved' ? t`Record the award` : t`Approve application`}
        description={approving ? applicantName(approving) : undefined}
        size="md"
      >
        {approving && (
          <div className="space-y-4">
            <p className="text-sm text-ktip-sand-600">
              {approving.status === 'approved' ? (
                <Trans>This application is already approved. Recording an amount updates the funding totals on your dashboard and the applicant's.</Trans>
              ) : (
                <Trans>{applicantName(approving)} will be told their application was approved.</Trans>
              )}
            </p>

            {canAward && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="award-amount">
                    <Trans>Amount awarded (optional)</Trans>
                  </label>
                  <input
                    id="award-amount"
                    type="number"
                    min="0"
                    step="any"
                    value={awardAmount}
                    onChange={(e) => setAwardAmount(e.currentTarget.value)}
                    placeholder="50000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="award-currency">
                    <Trans>Currency</Trans>
                  </label>
                  <input
                    id="award-currency"
                    type="text"
                    value={awardCurrency}
                    onChange={(e) => setAwardCurrency(e.currentTarget.value)}
                    className={inputClass}
                  />
                </div>
                <p className="text-xs text-ktip-sand-500 sm:col-span-3">
                  <Trans>Totals are reported in the currency you enter and are never converted.</Trans>
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setApproving(null)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button
                size="sm"
                loading={deciding || awarding}
                onClick={() => approve(approving)}
              >
                {approving.status === 'approved' ? (
                  <Trans>Record Award</Trans>
                ) : (
                  <Trans>Approve</Trans>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!rejecting}
        title={t`Do not accept`}
        message={
          rejecting
            ? t`${applicantName(rejecting)} will be told their application was not accepted. You can change this afterwards.`
            : ''
        }
        confirmLabel={t`Do not accept`}
        confirmVariant="danger"
        loading={deciding}
        onConfirm={() => rejecting && record(rejecting, 'rejected')}
        onCancel={() => setRejecting(null)}
      />
    </>
  )
}
