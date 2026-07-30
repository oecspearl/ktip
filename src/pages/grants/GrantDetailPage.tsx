import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { DetailsList } from '../../components/shared/DetailsList'
import { DocumentsPanel } from '../../components/documents/DocumentsPanel'
import { useGrant, useApplyForGrant, useDraftApplication } from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import {
  DollarSign,
  Calendar,
  Users,
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Wallet,
} from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { grantImageFor } from '../../lib/hero-images'
import { formatCurrency, formatDate, truncate } from '../../lib/utils'
import { isPast } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function GrantDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { grant, loading: grantLoading } = useGrant(params.id)
  usePageTitle(grant?.title)
  const { getApplicationCount } = useApplyForGrant()
  const { application, loading: applicationChecking } = useDraftApplication(
    params.id,
    auth.user?.id
  )

  const [applicationCount, setApplicationCount] = useState(0)

  const hasDraft = application?.status === 'draft'
  const hasApplied = !!application && application.status !== 'draft'
  const checking = !!auth.user && applicationChecking

  const isExpired = !!(grant && grant.deadline && isPast(new Date(grant.deadline)))
  // Students hold grant:view but never grant:apply — they draft an application
  // and a faculty sponsor submits it. The DB enforces this; this just keeps the
  // button honest about what will happen.
  const isStudent = !!auth.profile?.roles?.includes('student')
  const canSubmit = auth.can('grant:apply')
  const canApply = !!(
    grant &&
    grant.is_active &&
    !isExpired &&
    !hasApplied &&
    (canSubmit || isStudent)
  )
  // Only OECS admins can write to a grant, so only they see field proposals
  const isOecs = auth.can('org:manage')

  // Load submitted-application count
  useEffect(() => {
    if (grant) {
      getApplicationCount(grant.id)
        .then(setApplicationCount)
        .catch((error) => console.error('Error loading application count:', error))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant?.id])

  const getAmountDisplay = () => {
    if (!grant) return ''
    if (grant.amount_min && grant.amount_max) {
      return `${formatCurrency(grant.amount_min, grant.currency)} - ${formatCurrency(grant.amount_max, grant.currency)}`
    } else if (grant.amount_min) {
      return `${formatCurrency(grant.amount_min, grant.currency)}+`
    } else if (grant.amount_max) {
      return `Up to ${formatCurrency(grant.amount_max, grant.currency)}`
    }
    return 'Amount varies'
  }

  if (grantLoading || !grant) {
    if (grantLoading) {
      return (
        <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
          <p className="mt-4 text-ktip-sand-600">Loading grant...</p>
        </div>
      )
    }
    return (
      <div className="w-full max-w-[calc(50vw+48rem)] mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Wallet size={32} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Grant Not Found
        </h2>
        <p className="text-gray-500 mb-6">
          This grant doesn't exist or has been removed.
        </p>
        <button
          onClick={() => navigate('/grants')}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg"
        >
          Back to Grants
        </button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow="Grant Detail"
        title={grant.title}
        image={grantImageFor(grant.id, grant.grant_type, grant.is_climate_action)}
        imageSeed={grant.id}
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Grants', href: '/grants' },
          { label: truncate(grant.title, 30) },
        ]}
      >
        <div className="flex flex-wrap items-center gap-2">
          {grant.grant_type && (
            <Badge variant="primary">
              {grant.grant_type?.replace('_', ' ').toUpperCase()}
            </Badge>
          )}
          {!grant.is_active && (
            <Badge variant="default">Inactive</Badge>
          )}
          {isExpired && (
            <Badge variant="danger">Expired</Badge>
          )}
        </div>
      </PageHero>

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-[calc(50vw+36rem)] mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Status Banner */}
            {isExpired && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle size={20} />
                  <p className="font-medium">This grant has expired</p>
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="flex items-center gap-3 text-ktip-ocean-600 mb-6">
              <DollarSign size={32} />
              <span className="text-3xl font-bold">{getAmountDisplay()}</span>
            </div>

            {/* Key Details */}
            <div
              id="key-details"
              data-spy="Key details"
              className="scroll-mt-24 grid md:grid-cols-2 gap-4 mb-8 p-4 bg-ktip-canvas rounded-xl"
            >
              {grant.deadline && (
                <div className="flex items-start gap-3">
                  <Calendar size={20} className="text-ktip-ocean-600 mt-1" />
                  <div>
                    <p className="text-sm text-ktip-sand-600">Deadline</p>
                    <p
                      className={`font-medium ${
                        isExpired ? 'text-red-600' : 'text-ktip-sand-900'
                      }`}
                    >
                      {formatDate(grant.deadline)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <FileText size={20} className="text-ktip-ocean-600 mt-1" />
                <div>
                  <p className="text-sm text-ktip-sand-600">Applications</p>
                  <p className="font-medium text-ktip-sand-900">
                    {applicationCount} submitted
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            {grant.description && (
              <div id="about" data-spy="About" className="scroll-mt-24 mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  About this Grant
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Grant overview and details</p>
                <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                  {grant.description}
                </div>
              </div>
            )}

            {/* Additional Details */}
            {grant.details && grant.details.length > 0 && (
              <div id="details" data-spy="Details" className="scroll-mt-24 mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  Additional Details
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Key facts at a glance</p>
                <DetailsList details={grant.details} />
              </div>
            )}

            {/* Eligibility */}
            {grant.eligibility && (
              <div id="eligibility" data-spy="Eligibility" className="scroll-mt-24 mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                  <Users size={18} />
                  Eligibility Requirements
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4">Who can apply</p>
                <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                  {grant.eligibility}
                </div>
              </div>
            )}

            {/* Documents */}
            <div id="documents" data-spy="Documents" className="scroll-mt-24 mb-8">
              <DocumentsPanel
                entityType="grant"
                entityId={grant.id}
                canEditEntity={isOecs}
                entity={grant}
              />
            </div>
          </div>

          {/* === Sidebar === */}
          <div className="lg:col-span-1">
            {/* Widget 1: Apply for Grant */}
            <div data-tutorial="grant-apply" className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Apply for Grant
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Submit your application</p>

              {checking && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                </div>
              )}

              {!checking && (
                <>
                  {hasApplied && (
                    <div className="bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 text-ktip-tropical-700 mb-2">
                        <CheckCircle size={20} />
                        <span className="font-medium">Application Submitted!</span>
                      </div>
                      <p className="text-sm text-ktip-tropical-600">
                        Your application is under review.
                      </p>
                    </div>
                  )}

                  {isExpired && !hasApplied && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-red-700">
                        This grant has expired and is no longer accepting applications.
                      </p>
                    </div>
                  )}

                  {!grant.is_active && !hasApplied && (
                    <div className="bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-gray-700">
                        This grant is currently inactive.
                      </p>
                    </div>
                  )}

                  {grant.application_url && (
                    <Button
                      fullWidth
                      icon={<ExternalLink size={20} />}
                      onClick={() => window.open(grant.application_url!, '_blank')}
                    >
                      Apply on External Site
                    </Button>
                  )}

                  {!grant.application_url && canApply && (
                    <>
                      <Button
                        fullWidth
                        onClick={() => navigate(`/grants/${grant.id}/apply`)}
                        icon={<FileText size={20} />}
                      >
                        {hasDraft ? 'Continue Application' : isStudent ? 'Start Application' : 'Apply Now'}
                      </Button>
                      {isStudent && (
                        <p className="mt-2 text-xs text-ktip-sand-600">
                          Student applications must be sponsored. Nominate a faculty member in the
                          application — they accept it, and then it can be submitted.
                        </p>
                      )}
                    </>
                  )}

                  {!grant.application_url && !canApply && !hasApplied && !isExpired && auth.user && (
                    <p className="text-sm text-ktip-sand-600">
                      Your account does not have permission to apply for grants.
                    </p>
                  )}
                </>
              )}

              <div className="mt-4 pt-4 border-t border-ktip-sand-100">
                <p className="text-sm text-ktip-sand-600">
                  {applicationCount} {applicationCount === 1 ? 'application' : 'applications'}{' '}
                  submitted
                </p>
              </div>
            </div>

            {/* Widget 2: Grant Information */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                Grant Information
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4">Key details</p>
              <div className="text-sm divide-y divide-ktip-sand-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Currency</span>
                  <span className="font-medium text-ktip-sand-900">
                    {grant.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Status</span>
                  <span className="font-medium text-ktip-sand-900">
                    {grant.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500">Posted</span>
                  <span className="font-medium text-ktip-sand-900">
                    {formatDate(grant.created_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  )
}
