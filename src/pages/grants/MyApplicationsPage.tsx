import { Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import {
  useGrantApplications,
  useReviewSponsorship,
  useSponsorshipRequests,
} from '../../hooks/useGrants'
import { useSubmissionReceipts } from '../../hooks/useSubmissionReceipts'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  FileText,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  PencilLine,
  Receipt,
  Download,
} from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import { GRANT_APPLICATION_STATUS_LABELS } from '../../lib/constants'
import { usePageTitle } from '../../hooks/usePageTitle'
import { PageHero } from '../../components/layout/PageHero'
import { entityPath } from '../../lib/slug'
import { Trans, Plural, useLingui } from '@lingui/react/macro'

export default function MyApplicationsPage() {
    const { t } = useLingui()
  usePageTitle(t`My Grant Applications`)
  const auth = useAuth()
  const { applications, loading } = useGrantApplications(auth.user?.id)
  const { receipts } = useSubmissionReceipts(auth.user?.id)
  const { requests: sponsorships, refetch: refetchSponsorships } = useSponsorshipRequests(auth.user?.id)
  const { reviewSponsorship } = useReviewSponsorship()
  const toast = useToast()

  const handleSponsorship = async (applicationId: string, accept: boolean) => {
    try {
      await reviewSponsorship({ applicationId, accept })
      toast.success(accept ? t`Sponsorship accepted` : t`Sponsorship declined`)
      refetchSponsorships()
    } catch (err: any) {
      toast.error(err.message || t`Could not record your decision`)
    }
  }

  // application id -> receipt id, for the "submitted copy" link
  const receiptByApplication = new Map(
    (receipts || [])
      .filter((r) => r.source_table === 'grant_applications')
      .map((r) => [r.source_id, r.id])
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200'
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200'
      case 'under_review':
        return 'bg-ktip-ocean-100 text-ktip-ocean-700 border-ktip-ocean-200'
      case 'draft':
        return 'bg-ktip-sun-100 text-ktip-sun-800 border-ktip-sun-200'
      default:
        return 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={16} />
      case 'rejected':
        return <XCircle size={16} />
      case 'under_review':
        return <Clock size={16} />
      case 'draft':
        return <PencilLine size={16} />
      default:
        return <AlertCircle size={16} />
    }
  }

  // New-style applications use wizard keys; legacy rows used camelCase keys
  const getProjectTitle = (data: Record<string, any>) =>
    data.title || data.projectTitle || null
  const getFundingAmount = (data: Record<string, any>) =>
    data.funding_amount || data.fundingAmount || null
  const getSummary = (data: Record<string, any>) => {
    const raw = data.executive_summary || data.projectDescription || ''
    // Wizard fields are rich text; strip tags for the snippet
    return String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
  }

  const getStatusLabel = (status: string) => {
    return (
      GRANT_APPLICATION_STATUS_LABELS[status] ??
      status
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`My Applications`}
        title={t`Grant Applications`}
        subtitle={t`Track the status of your funding applications`}
        image="/grants/grant-pitch.webp"
        imageSeed="grants"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Grants`, href: '/grants' },
          { label: t`My Applications` },
        ]}
      />

      {/* Content — data-spy-off: two stacked lists, and most members never see
          the sponsorships one at all, so the rail would be a single dash under
          the hero's. Markers stay for the tour. */}
      <div data-spy-off className="w-full max-w-page mx-auto px-4 pt-8 pb-8">
        {/* Sponsorship requests. Only faculty and school partners see this —
            a student's application cannot be submitted until one is accepted. */}
        {(sponsorships?.length ?? 0) > 0 && (
          <div
            id="sponsorships"
            data-spy="Sponsorships"
            className="scroll-mt-24 bg-ktip-cream border border-ktip-sand-200 rounded-2xl shadow-card mb-6 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-ktip-sand-100">
              <h2 className="font-display font-bold text-ktip-sand-900"><Trans>Sponsorship requests</Trans></h2>
              <p className="text-sm text-ktip-sand-600 mt-0.5">
                <Trans>Students who have nominated you as their faculty sponsor.</Trans>
              </p>
            </div>
            <ul className="divide-y divide-ktip-sand-100">
              {sponsorships?.map((request: any) => {
                const approvedDate = request.sponsor_approved_at
                  ? formatDate(request.sponsor_approved_at)
                  : null
                return (
                <li key={request.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ktip-sand-900 truncate">
                      {request.applicant?.display_name || t`Student`} · {request.grant?.title || t`Grant`}
                    </p>
                    <p className="text-xs text-ktip-sand-500">
                      {approvedDate
                        ? t`Accepted ${approvedDate}`
                        : t`Awaiting your decision`}
                    </p>
                  </div>
                  {!request.sponsor_approved_at && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSponsorship(request.id, false)}
                      >
                        <Trans>Decline</Trans>
                      </Button>
                      <Button size="sm" onClick={() => handleSponsorship(request.id, true)}>
                        <Trans>Accept</Trans>
                      </Button>
                    </div>
                  )}
                </li>
                )
              })}
            </ul>
          </div>
        )}

        {loading || !applications ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
            <p className="mt-4 text-ktip-sand-600"><Trans>Loading applications...</Trans></p>
          </div>
        ) : applications.length > 0 ? (
          <div
            id="applications"
            data-spy="Applications"
            className="scroll-mt-24 bg-ktip-cream border border-ktip-sand-200 rounded-lg"
          >
            <div className="px-6 py-4 border-b border-ktip-sand-200">
              <p className="text-sm text-ktip-sand-600">
                <Plural value={applications.length} one="# application" other="# applications" />
              </p>
            </div>

            {applications.map((application, index) => (
              <div
                key={application.id}
                className={`px-6 py-5 ${index < applications.length - 1 ? 'border-b border-ktip-sand-200' : ''}`}
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  {/* Grant Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1">
                        <Link
                          to={entityPath('grant', application.grant)}
                          className="text-title-sm font-display font-bold text-ktip-sand-900 hover:text-ktip-ocean-600 transition-colors"
                        >
                          {application.grant.title}
                        </Link>
                        {application.grant.grant_type && (
                          <Badge variant="primary" className="mt-2">
                            {application.grant
                              .grant_type!.replace('_', ' ')
                              .toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Application Data Summary */}
                    <div className="space-y-2 mb-4">
                      {getProjectTitle(application.application_data) && (
                        <div>
                          <span className="text-sm text-ktip-sand-600">
                            <Trans>Project:</Trans>{' '}
                          </span>
                          <span className="text-sm font-medium text-ktip-sand-900">
                            {getProjectTitle(application.application_data)}
                          </span>
                        </div>
                      )}
                      {getFundingAmount(application.application_data) && (
                        <div className="flex items-center gap-2">
                          <DollarSign size={16} className="text-ktip-sand-400" />
                          <span className="text-sm text-ktip-sand-600">
                            <Trans>Requested:</Trans>{' '}
                          </span>
                          <span className="text-sm font-medium text-ktip-sand-900">
                            {Number.isFinite(
                              parseFloat(getFundingAmount(application.application_data))
                            ) && /^\d/.test(String(getFundingAmount(application.application_data)).trim())
                              ? formatCurrency(
                                  parseFloat(getFundingAmount(application.application_data)),
                                  application.grant.currency
                                )
                              : getFundingAmount(application.application_data)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-ktip-sand-500">
                      <div className="flex items-center gap-1">
                        <Calendar size={16} />
                        <span>
                          {application.status === 'draft' ? t`Started` : t`Applied`}{' '}
                          {formatDate(application.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex flex-col items-end gap-2">
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getStatusColor(
                        application.status
                      )}`}
                    >
                      {getStatusIcon(application.status)}
                      <span className="text-sm font-medium">
                        {getStatusLabel(application.status)}
                      </span>
                    </div>
                    {application.status === 'draft' ? (
                      <Link to={`/grants/${application.grant.id}/apply`}>
                        <Button size="sm" icon={<PencilLine size={16} />}>
                          <Trans>Continue</Trans>
                        </Button>
                      </Link>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {/* Two doors to one page: read it, or go straight to
                            the print dialog. "Download PDF" is what applicants
                            search for — "submitted copy" is what it is. */}
                        {receiptByApplication.has(application.id) && (
                          <>
                            <Link
                              to={`/dashboard/submissions/${receiptByApplication.get(application.id)}?print=1`}
                            >
                              <Button variant="outline" size="sm" icon={<Download size={16} />}>
                                <Trans>Download PDF</Trans>
                              </Button>
                            </Link>
                            <Link to={`/dashboard/submissions/${receiptByApplication.get(application.id)}`}>
                              <Button variant="outline" size="sm" icon={<Receipt size={16} />}>
                                <Trans>View submitted copy</Trans>
                              </Button>
                            </Link>
                          </>
                        )}
                        <Link to={entityPath('grant', application.grant)}>
                          <Button variant="outline" size="sm">
                            <Trans>View Grant</Trans>
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary */}
                {getSummary(application.application_data) && (
                  <div className="mt-4 pt-4 border-t border-ktip-sand-100">
                    <p className="text-sm text-ktip-sand-600 mb-1">
                      <Trans>Executive Summary</Trans>
                    </p>
                    <p className="text-sm text-ktip-sand-700 line-clamp-3">
                      {getSummary(application.application_data)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-ktip-cream border border-ktip-sand-200 rounded-lg p-6">
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText size={32} className="text-ktip-sand-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                <Trans>No applications yet</Trans>
              </h3>
              <p className="text-ktip-sand-600 mb-6">
                <Trans>You haven't applied for any grants yet. Browse available opportunities and submit your first application.</Trans>
              </p>
              <Link to="/grants">
                <Button icon={<FileText size={20} />}><Trans>Browse Grants</Trans></Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
