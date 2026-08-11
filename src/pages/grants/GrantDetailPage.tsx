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
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { Trans, Plural, useLingui } from '@lingui/react/macro'

export default function GrantDetailPage() {
    const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { grant, loading: grantLoading } = useGrant(params.id)
  useCanonicalSlug(params.id, grant)
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
  // One rule for everyone since migration 110. Students used to be routed
  // through a sponsor here — they held grant:view and never grant:apply — and
  // the button had to say "Start Application" because submitting was somebody
  // else's act. They hold grant:apply now, and a faculty endorsement is offered
  // inside the wizard rather than required before it.
  const canApply = !!(grant && grant.is_active && !isExpired && !hasApplied && auth.can('grant:apply'))
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
      const amount = formatCurrency(grant.amount_max, grant.currency)
      return t`Up to ${amount}`
    }
    return t`Amount varies`
  }

  if (grantLoading || !grant) {
    if (grantLoading) {
      return (
        <div className="w-full max-w-page mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ktip-ocean-500 mx-auto"></div>
          <p className="mt-4 text-ktip-sand-600"><Trans>Loading grant...</Trans></p>
        </div>
      )
    }
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Wallet size={32} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Grant Not Found</Trans>
        </h2>
        <p className="text-gray-500 mb-6">
          <Trans>This grant doesn't exist or has been removed.</Trans>
        </p>
        <button
          onClick={() => navigate('/grants')}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg"
        >
          <Trans>Back to Grants</Trans>
        </button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Grant Detail`}
        title={grant.title}
        image={grantImageFor(grant.id, grant.grant_type, grant.is_climate_action)}
        imageSeed={grant.id}
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Grants`, href: '/grants' },
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
            <Badge variant="default"><Trans>Inactive</Trans></Badge>
          )}
          {isExpired && (
            <Badge variant="danger"><Trans>Expired</Trans></Badge>
          )}
        </div>
      </PageHero>

      {/* === Two-Column Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-page-mid mx-auto px-4">

          {/* === Main Column === */}
          <div className="lg:col-span-2">
            {/* Status Banner */}
            {isExpired && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle size={20} />
                  <p className="font-medium"><Trans>This grant has expired</Trans></p>
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
                    <p className="text-sm text-ktip-sand-600"><Trans>Deadline</Trans></p>
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
                  <p className="text-sm text-ktip-sand-600"><Trans>Applications</Trans></p>
                  <p className="font-medium text-ktip-sand-900">
                    <Trans>{applicationCount} submitted</Trans>
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            {grant.description && (
              <div id="about" data-spy="About" className="scroll-mt-24 mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  <Trans>About this Grant</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Grant overview and details</Trans></p>
                <div className="text-gray-700 leading-relaxed text-base whitespace-pre-wrap">
                  {grant.description}
                </div>
              </div>
            )}

            {/* Additional Details */}
            {grant.details && grant.details.length > 0 && (
              <div id="details" data-spy="Details" className="scroll-mt-24 mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                  <Trans>Additional Details</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Key facts at a glance</Trans></p>
                <DetailsList details={grant.details} />
              </div>
            )}

            {/* Eligibility */}
            {grant.eligibility && (
              <div id="eligibility" data-spy="Eligibility" className="scroll-mt-24 mb-8">
                <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1 flex items-center gap-2">
                  <Users size={18} />
                  <Trans>Eligibility Requirements</Trans>
                </h3>
                <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Who can apply</Trans></p>
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
                <Trans>Apply for Grant</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Submit your application</Trans></p>

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
                        <span className="font-medium"><Trans>Application Submitted!</Trans></span>
                      </div>
                      <p className="text-sm text-ktip-tropical-600">
                        <Trans>Your application is under review.</Trans>
                      </p>
                    </div>
                  )}

                  {isExpired && !hasApplied && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-red-700">
                        <Trans>This grant has expired and is no longer accepting applications.</Trans>
                      </p>
                    </div>
                  )}

                  {!grant.is_active && !hasApplied && (
                    <div className="bg-ktip-sand-50 border border-ktip-sand-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-gray-700">
                        <Trans>This grant is currently inactive.</Trans>
                      </p>
                    </div>
                  )}

                  {grant.application_url && (
                    <Button
                      fullWidth
                      icon={<ExternalLink size={20} />}
                      onClick={() => window.open(grant.application_url!, '_blank')}
                    >
                      <Trans>Apply on External Site</Trans>
                    </Button>
                  )}

                  {!grant.application_url && canApply && (
                    <Button
                      fullWidth
                      onClick={() => navigate(`/grants/${grant.id}/apply`)}
                      icon={<FileText size={20} />}
                    >
                      {hasDraft ? t`Continue Application` : t`Apply Now`}
                    </Button>
                  )}

                  {!grant.application_url && !canApply && !hasApplied && !isExpired && auth.user && (
                    <p className="text-sm text-ktip-sand-600">
                      <Trans>Your account does not have permission to apply for grants.</Trans>
                    </p>
                  )}
                </>
              )}

              <div className="mt-4 pt-4 border-t border-ktip-sand-100">
                <p className="text-sm text-ktip-sand-600">
                  <Plural
                    value={applicationCount}
                    one="# application submitted"
                    other="# applications submitted"
                  />
                </p>
              </div>
            </div>

            {/* Widget 2: Grant Information */}
            <div className="mb-10">
              <h3 className="font-display font-bold text-ktip-sand-900 uppercase text-sm tracking-wider mb-1">
                <Trans>Grant Information</Trans>
              </h3>
              <p className="text-ktip-ocean-600 text-xs italic mb-4"><Trans>Key details</Trans></p>
              <div className="text-sm divide-y divide-ktip-sand-100">
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Currency</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {grant.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Status</Trans></span>
                  <span className="font-medium text-ktip-sand-900">
                    {grant.is_active ? t`Active` : t`Inactive`}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-gray-500"><Trans>Posted</Trans></span>
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
