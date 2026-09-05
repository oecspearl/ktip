import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/admin/ConfirmModal'
import { ApplicationPreview } from '../../components/grants/application/ApplicationPreview'
import { DocumentsPanel } from '../../components/documents/DocumentsPanel'
import { useGrant, useFunderApplications, useDecideApplication } from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { GRANT_APPLICATION_STATUS_COLORS, GRANT_APPLICATION_STATUS_LABELS } from '../../lib/constants'
import { formatDate } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { Eye, CheckCircle, XCircle, Clock, Inbox } from 'lucide-react'
import type { GrantApplication } from '../../types'
import { Trans, Plural, useLingui } from '@lingui/react/macro'

type Decision = 'under_review' | 'approved' | 'rejected'

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

  const { applications, loading, refetch } = useFunderApplications(grant?.id)
  const { decide, loading: deciding } = useDecideApplication()

  const [viewing, setViewing] = useState<GrantApplication | null>(null)
  const [confirming, setConfirming] = useState<{
    application: GrantApplication
    status: Extract<Decision, 'approved' | 'rejected'>
  } | null>(null)

  // The same pair migration 130 checks. RLS decides for real; this only stops
  // the page rendering an empty list to somebody who should not be here.
  const ownsGrant = !!grant && !!auth.user && grant.created_by === auth.user.id
  const canReview = ownsGrant ? auth.can('grant:post') : auth.can('grant:manage')

  const counts = useMemo(() => {
    const out = { pending: 0, under_review: 0, approved: 0, rejected: 0 } as Record<string, number>
    for (const application of applications ?? []) {
      out[application.status] = (out[application.status] ?? 0) + 1
    }
    return out
  }, [applications])

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
      setConfirming(null)
      setViewing(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || t`Could not record that decision`)
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
        image="/grants/grant-pitch.webp"
        imageSeed="grants"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Grants`, href: '/grants' },
          { label: t`My Grants`, href: '/grants/my-grants' },
          { label: t`Applications` },
        ]}
      />

      <div data-spy-off className="w-full max-w-page mx-auto px-4 pt-8 pb-12">
        {loading || !applications ? (
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

                    {application.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => setConfirming({ application, status: 'approved' })}
                        className="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                        title={t`Approve`}
                      >
                        <CheckCircle size={16} />
                      </button>
                    )}

                    {application.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => setConfirming({ application, status: 'rejected' })}
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
                  onClick={() => setConfirming({ application: viewing, status: 'rejected' })}
                >
                  <Trans>Do Not Accept</Trans>
                </Button>
              )}
              {viewing.status !== 'approved' && (
                <Button
                  size="sm"
                  icon={<CheckCircle size={14} />}
                  onClick={() => setConfirming({ application: viewing, status: 'approved' })}
                >
                  <Trans>Approve</Trans>
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirming}
        title={confirming?.status === 'approved' ? t`Approve application` : t`Do not accept`}
        message={
          confirming
            ? confirming.status === 'approved'
              ? t`${applicantName(confirming.application)} will be told their application was approved.`
              : t`${applicantName(confirming.application)} will be told their application was not accepted. You can change this afterwards.`
            : ''
        }
        confirmLabel={confirming?.status === 'approved' ? t`Approve` : t`Do not accept`}
        confirmVariant={confirming?.status === 'approved' ? 'primary' : 'danger'}
        loading={deciding}
        onConfirm={() => confirming && record(confirming.application, confirming.status)}
        onCancel={() => setConfirming(null)}
      />
    </>
  )
}
