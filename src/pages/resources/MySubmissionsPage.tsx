import { Link } from 'react-router'
import { BookOpen, Clock, CheckCircle2, XCircle, ShieldAlert, Plus } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { PageHero } from '../../components/layout/PageHero'
import { Badge } from '../../components/ui/Badge'
import { useMyResourceSubmissions } from '../../hooks/useResources'
import { useAuth } from '../../contexts/AuthContext'
import { usePageTitle } from '../../hooks/usePageTitle'
import { formatRelativeTime } from '../../lib/utils'
import { entityPath } from '../../lib/slug'
import type { Resource, ResourceApprovalStatus } from '../../types'

/**
 * Where a member watches their own contributions through review.
 *
 * This page exists because the rejection notification has to link somewhere.
 * It is not a fourth tab on ResourcesPage: that strip is the public library,
 * and a pending submission is not in it by construction.
 */
export default function MySubmissionsPage() {
  const { t } = useLingui()
  const auth = useAuth()
  const { submissions, loading } = useMyResourceSubmissions(auth.user?.id)

  usePageTitle(t`My Submissions`)

  return (
    <>
      <PageHero
        eyebrow={t`Contribute`}
        title={t`My Submissions`}
        subtitle={t`Everything you have contributed to the resource library, and where it stands.`}
        imageSeed="resources"
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Resources`, href: '/resources' },
          { label: t`My Submissions` },
        ]}
      />

      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-narrow mx-auto px-4">
          <div className="mb-6 flex justify-end">
            <Link to="/resources/submit">
              <button className="btn-brand inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-label font-bold uppercase tracking-wider">
                <Plus size={16} />
                <Trans>Submit a Resource</Trans>
              </button>
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse-soft rounded-xl bg-ktip-sand-100" />
              ))}
            </div>
          ) : submissions?.length ? (
            <div className="space-y-3">
              {submissions.map((resource) => (
                <SubmissionRow key={resource.id} resource={resource} />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ktip-sand-100">
                <BookOpen size={32} className="text-ktip-sand-400" />
              </div>
              <p className="mb-2 text-lg font-medium text-ktip-sand-700">
                <Trans>You have not submitted anything yet</Trans>
              </p>
              <p className="text-label text-ktip-sand-500">
                <Trans>Share a guide, template or case study and a reviewer will publish it.</Trans>
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SubmissionRow({ resource }: { resource: Resource }) {
  const { t } = useLingui()

  // Two independent things can be true of one row — a reviewer has not looked
  // at it yet AND the automated filter held it (migration 135 arms quarantine
  // mode for this table). Showing only the first would leave a member wondering
  // why "pending" is taking so long.
  const quarantined = resource.status === 'quarantined'

  return (
    <div className="rounded-xl border border-ktip-sand-200 bg-ktip-cream p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display font-bold text-ktip-sand-900">
            {resource.approval_status === 'approved' && resource.is_published ? (
              <Link to={entityPath('resource', resource)} className="hover:underline">
                {resource.title}
              </Link>
            ) : (
              resource.title
            )}
          </h3>
          {resource.summary && (
            <p className="mt-1 line-clamp-2 text-label text-ktip-sand-600">{resource.summary}</p>
          )}
          <p className="mt-2 text-caption text-ktip-sand-400">
            <Trans>Submitted {formatRelativeTime(resource.submitted_at || resource.created_at)}</Trans>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {quarantined && (
            <Badge variant="warning" size="sm">
              <span className="inline-flex items-center gap-1">
                <ShieldAlert size={12} />
                <Trans>Held for checks</Trans>
              </span>
            </Badge>
          )}
          <StatusBadge status={resource.approval_status} />
        </div>
      </div>

      {/* The reviewer's note is the whole point of a rejection — without it the
          member has nothing to act on and resubmits the same thing. */}
      {resource.approval_status === 'rejected' && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-label text-red-800">
          {resource.review_note || t`No reason was given. You can edit it and submit it again.`}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ResourceApprovalStatus }) {
  if (status === 'approved') {
    return (
      <Badge variant="success" size="sm">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 size={12} />
          <Trans>Published</Trans>
        </span>
      </Badge>
    )
  }
  if (status === 'rejected') {
    return (
      <Badge variant="danger" size="sm">
        <span className="inline-flex items-center gap-1">
          <XCircle size={12} />
          <Trans>Not accepted</Trans>
        </span>
      </Badge>
    )
  }
  if (status === 'draft') {
    return (
      <Badge variant="default" size="sm">
        <Trans>Draft</Trans>
      </Badge>
    )
  }
  return (
    <Badge variant="info" size="sm">
      <span className="inline-flex items-center gap-1">
        <Clock size={12} />
        <Trans>In review</Trans>
      </span>
    </Badge>
  )
}
