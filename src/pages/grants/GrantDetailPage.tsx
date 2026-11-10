import { useEffect, useState } from 'react'
import { Disclaimer } from '../../components/legal/Disclaimer'
import { useParams, useNavigate, useLocation, Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { DetailsList } from '../../components/shared/DetailsList'
import { DocumentsPanel } from '../../components/documents/DocumentsPanel'
import { EngagementNotice } from '../../components/shared/EngagementNotice'
import { useEngagementGate } from '../../hooks/useEngagement'
import { useGrant, useApplyForGrant, useDraftApplication } from '../../hooks/useGrants'
import { useAuth } from '../../contexts/AuthContext'
import {
  Users,
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Wallet,
  Pencil,
  Inbox,
} from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { grantImageFor } from '../../lib/hero-images'
import { fundingTypeLabel } from '../../lib/funding-types'
import { formatCurrency, formatDate } from '../../lib/utils'
import { differenceInCalendarDays, isPast } from 'date-fns'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useCanonicalSlug } from '../../hooks/useCanonicalSlug'
import { useRecordView } from '../../hooks/useRecordView'
import { Trans, Plural, useLingui } from '@lingui/react/macro'
import { useGrantTrail } from '../../hooks/useCategoryTrail'
import { FactStrip } from '../../components/detail/FactStrip'
import { DetailActionCard } from '../../components/detail/DetailActionCard'
import { grantTarget } from '../../lib/share/targets'
import { entityPath } from '../../lib/slug'
import { isHttpUrl } from '../../lib/submission-checklist'

export default function GrantDetailPage() {
    const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()

  const { grant, loading: grantLoading } = useGrant(params.id)
  const breadcrumb = useGrantTrail(grant)
  useCanonicalSlug(params.id, grant)
  useRecordView('grant', grant?.id)
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
  // Migration 111 — the applicant's own organisation may have switched this
  // off, or this call may be closed to the publisher's staff.
  const gate = useEngagementGate(grant)
  const canApply = !!(
    grant &&
    grant.is_active &&
    grant.moderation_status !== 'suspended' &&
    !isExpired &&
    !hasApplied &&
    auth.can('grant:apply') &&
    gate.allowed
  )
  // Only somebody who administers grants can write to one, so only they see
  // field proposals. (116: was org:manage.)
  const isOecs = auth.can('grant:manage')
  // 077's owner arm: the funder who posted the call manages it and its
  // documents, exactly as the RLS policies on grants and entity documents say.
  const ownsGrant = !!grant && !!auth.user && grant.created_by === auth.user.id
  const canManageThisGrant = isOecs || (ownsGrant && auth.can('grant:post'))
  // 181: editing is the poster's alone. An administrator still sees the strip
  // (and the read-only applications list) but not the Edit button.
  const canEditThisGrant = ownsGrant && auth.can('grant:post')
  // 181: the reason is shown to the poster and to administrators. RLS hides a
  // suspended call from everybody else, so nobody else reaches this page.
  const isSuspended = grant?.moderation_status === 'suspended'
  const showSuspension = isSuspended && (ownsGrant || isOecs)

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

  // Only a live, open call gets a Share button: an expired or suspended one
  // would send people to something they can't apply to.
  const shareTarget =
    grant.is_active && !isSuspended && !isExpired
      ? grantTarget(
          { ...grant, image_url: grantImageFor(grant.id, grant.grant_type) },
          `${window.location.origin}${entityPath('grant', grant)}`
        )
      : null

  const daysLeft = grant.deadline ? differenceInCalendarDays(new Date(grant.deadline), new Date()) : null
  const closesOn = grant.deadline ? formatDate(grant.deadline, 'EEE, MMM d') : ''
  const cardStatus = isSuspended
    ? { title: t`Suspended by KTIP`, sub: null }
    : !grant.is_active
      ? { title: t`Not taking applications`, sub: null }
      : isExpired
        ? { title: t`Applications closed`, sub: t`Closed ${closesOn}` }
        : { title: t`Open for applications`, sub: grant.deadline ? t`Closes ${closesOn}` : t`No closing date` }

  return (
    <>
      <PageHero
        eyebrow={t`Funding Detail`}
        title={grant.title}
        image={grantImageFor(grant.id, grant.grant_type)}
        imageSeed={grant.id}
        breadcrumb={breadcrumb}
      >
        <div className="flex flex-wrap items-center gap-2">
          {grant.funding_type && (
            <Badge variant="primary">
              {(fundingTypeLabel(grant.funding_type) || '').toUpperCase()}
            </Badge>
          )}
          {grant.grant_type && (
            <Badge variant="default">
              {grant.grant_type?.replace('_', ' ').toUpperCase()}
            </Badge>
          )}
          {!grant.is_active && (
            <Badge variant="default"><Trans>Inactive</Trans></Badge>
          )}
          {isSuspended && (
            <Badge variant="danger"><Trans>Suspended</Trans></Badge>
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
          <div className="min-w-0 lg:col-span-2">
            {/* 181: why KTIP suspended the call. Poster and administrators only. */}
            {showSuspension && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-2 text-red-700">
                  <AlertCircle size={20} className="shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium">
                      <Trans>KTIP has suspended this funding call. Members cannot see it.</Trans>
                    </p>
                    {grant.suspension_reason && (
                      <p className="mt-1 text-sm text-red-800 whitespace-pre-wrap">
                        <Trans>Reason: {grant.suspension_reason}</Trans>
                      </p>
                    )}
                    {ownsGrant && (
                      <p className="mt-2 text-sm">
                        <Link to="/dashboard/feedback" className="font-medium underline">
                          <Trans>Reply in Notes from KTIP</Trans>
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Key facts, as on an event page: what a visitor checks first. The
                closed state lives in the action card's title, not a banner. */}
            <FactStrip
              facts={[
                {
                  key: 'amount',
                  label: <Trans>Amount</Trans>,
                  value: getAmountDisplay(),
                  sub: grant.currency,
                },
                {
                  key: 'deadline',
                  label: <Trans>Deadline</Trans>,
                  value: grant.deadline ? formatDate(grant.deadline, 'MMM d, yyyy') : t`None`,
                  sub: isExpired ? (
                    <span className="text-red-600"><Trans>Closed</Trans></span>
                  ) : daysLeft !== null ? (
                    <Plural value={daysLeft} one="# day left" other="# days left" />
                  ) : (
                    <Trans>Open until filled</Trans>
                  ),
                },
                {
                  key: 'applications',
                  label: <Trans>Applications</Trans>,
                  value: applicationCount,
                  sub: <Trans>submitted</Trans>,
                },
                {
                  key: 'type',
                  label: <Trans>Type</Trans>,
                  value: fundingTypeLabel(grant.funding_type) || t`Funding`,
                  sub: grant.grant_type ? (
                    <span className="capitalize">{grant.grant_type.replace(/_/g, ' ')}</span>
                  ) : undefined,
                },
              ]}
            />

            {grant.summary && (
              <p className="text-lg text-ktip-sand-800 font-medium leading-relaxed mb-6">{grant.summary}</p>
            )}

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
                canEditEntity={canManageThisGrant}
                entity={grant}
              />
            </div>
          </div>

          {/* === Sidebar ===
              Same frame as the event page: first on a phone, pinned beside
              the content from lg up. */}
          <div className="contents lg:block lg:col-span-1">
            <div className="contents lg:block lg:sticky lg:top-[calc(var(--nav-offset)+1rem)] lg:max-h-[calc(100dvh-var(--nav-offset)-2rem)] lg:overflow-y-auto lg:space-y-8 lg:pb-2">
              {/* The anchor is written out here, not passed to the card: the
                  tutorial registry test checks for the literal attribute. */}
              <div className="order-first lg:order-none" data-tutorial="grant-apply">
                <DetailActionCard
                  ownerLabel={ownsGrant ? <Trans>Your funding call</Trans> : <Trans>You manage this call</Trans>}
                  ownerTools={
                    canManageThisGrant ? (
                      <>
                        <Link to={`/grants/${grant.slug || grant.id}/applications`}>
                          <Button variant="outline" size="sm" icon={<Inbox size={14} />} tabIndex={-1}>
                            <Trans>Applications</Trans>
                          </Button>
                        </Link>
                        {canEditThisGrant && (
                          <Link to={`/grants/${grant.slug || grant.id}/edit`}>
                            <Button variant="outline" size="sm" icon={<Pencil size={14} />} tabIndex={-1}>
                              <Trans>Edit</Trans>
                            </Button>
                          </Link>
                        )}
                      </>
                    ) : undefined
                  }
                  title={cardStatus.title}
                  sub={cardStatus.sub}
                  footer={
                    <Plural
                      value={applicationCount}
                      one="# application submitted"
                      other="# applications submitted"
                    />
                  }
                  share={shareTarget}
                >
                  {checking ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ktip-ocean-500 mx-auto"></div>
                    </div>
                  ) : (
                    <>
                      {hasApplied && (
                        <div className="bg-ktip-tropical-50 border border-ktip-tropical-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 text-ktip-tropical-700 mb-2">
                            <CheckCircle size={20} />
                            <span className="font-medium"><Trans>Application Submitted!</Trans></span>
                          </div>
                          <p className="text-sm text-ktip-tropical-600">
                            <Trans>Your application is under review.</Trans>
                          </p>
                        </div>
                      )}

                      {/* The switch reaches this button too, though only as far as
                          hiding it: the link leaves KTIP, so no policy can enforce
                          anything past this point. */}
                      {/* http(s) only, and the new tab gets no handle back on
                          this one: the address is whatever the poster typed,
                          and window.open() has none of React's guard against a
                          javascript: link. */}
                      {isHttpUrl(grant.application_url) && gate.allowed && !isExpired && grant.is_active && (
                        <Button
                          fullWidth
                          icon={<ExternalLink size={20} />}
                          onClick={() => window.open(grant.application_url!.trim(), '_blank', 'noopener,noreferrer')}
                        >
                          <Trans>Apply on External Site</Trans>
                        </Button>
                      )}

                      {!gate.allowed && auth.user && <EngagementNotice verdict={gate} />}

                      {!grant.application_url && canApply && (
                        <Button
                          fullWidth
                          onClick={() => navigate(`/grants/${grant.slug || grant.id}/apply`)}
                          icon={<FileText size={20} />}
                        >
                          {hasDraft ? t`Continue Application` : t`Apply Now`}
                        </Button>
                      )}

                      {/* gate.allowed: the organisation reason is already printed
                          above, and "your account has no permission" would be the
                          wrong explanation on top of it. */}
                      {!grant.application_url && !canApply && gate.allowed && !hasApplied && !isExpired && auth.user && (
                        <p className="text-sm text-ktip-sand-600">
                          <Trans>Your account does not have permission to apply for grants.</Trans>
                        </p>
                      )}

                      {/* AccountRoute keeps signed-out visitors off this page, so
                          this is a fallback for a session that ended while it was
                          open: it used to show no way forward at all. */}
                      {!auth.user && !isExpired && grant.is_active && (
                        <Button
                          fullWidth
                          onClick={() => navigate('/login', { state: { from: location } })}
                          icon={<FileText size={20} />}
                        >
                          <Trans>Sign in to apply</Trans>
                        </Button>
                      )}
                    </>
                  )}
                </DetailActionCard>
              </div>

              {/* Funding details */}
              <div className="rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-5">
                <h3 className="font-display font-bold text-ktip-sand-600 uppercase text-xs tracking-wider mb-2">
                  <Trans>Funding details</Trans>
                </h3>
                <div className="text-sm divide-y divide-ktip-sand-100">
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-ktip-sand-600"><Trans>Currency</Trans></span>
                    <span className="font-medium text-ktip-sand-900">{grant.currency}</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-ktip-sand-600"><Trans>Status</Trans></span>
                    <span className="font-medium text-ktip-sand-900">
                      {grant.is_active ? t`Active` : t`Inactive`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-ktip-sand-600"><Trans>Posted</Trans></span>
                    <span className="font-medium text-ktip-sand-900">{formatDate(grant.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Disclaimer variant="funding" placement="footer" />
        </div>
      </div>

    </>
  )
}
