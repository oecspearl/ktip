import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Trans, useLingui } from '@lingui/react/macro'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { AdminNoteModal } from '../../../components/admin/AdminNoteModal'
import { ApplicationPreview } from '../../../components/grants/application/ApplicationPreview'
import { GRANT_APPLICATION_STEPS } from '../../../lib/grant-application-template'
import { useUpdateGrant, useDeleteGrant } from '../../../hooks/useGrants'
import {
  useAdminGrants,
  grantOrganisationName,
  grantOwnerHref,
  type AdminGrantRow,
} from '../../../hooks/useGrantModeration'
import { useAdminGrantApplications } from '../../../hooks/useAdminDashboard'
import { useToast } from '../../../contexts/ToastContext'
import { useAuth } from '../../../contexts/AuthContext'
import { DeleteEntityControl } from '../../../components/shared/DeleteEntityControl'
import { describeGrantDeletion } from '../../../lib/delete-guard'
import {
  GRANT_TYPE_LABELS,
  GRANT_TYPE_COLORS,
  GRANT_APPLICATION_STATUS_LABELS,
  GRANT_APPLICATION_STATUS_COLORS,
} from '../../../lib/constants'
import { FUNDING_TYPE_COLORS, fundingTypeLabel } from '../../../lib/funding-types'
import { format } from 'date-fns'
import { cn } from '../../../lib/utils'
import { PageHero } from '../../../components/layout/PageHero'
import type { Grant, GrantApplication } from '../../../types'
import {
  DollarSign,
  Plus,
  Eye,
  EyeOff,
  FileText,
  Ban,
  RotateCcw,
  MessageSquare,
} from 'lucide-react'
import AdminGrantFormModal from './AdminGrantFormModal'
import { GrantSuspensionModal } from './GrantSuspensionModal'

type TabId = 'grants' | 'applications'

/** The organisation a call was posted for, linked, or failing that its poster. */
function OwnerCell({ row }: { row: Partial<AdminGrantRow> | undefined }) {
  const href = row ? grantOwnerHref(row) : null
  const name = grantOrganisationName(row?.employer) || row?.poster?.display_name || null
  if (!name) return <span className="text-sm text-gray-400">-</span>
  return href ? (
    <Link to={href} className="text-sm text-ktip-ocean-600 hover:underline">
      {name}
    </Link>
  ) : (
    <span className="text-sm text-gray-700">{name}</span>
  )
}

/**
 * /admin/grants. Since 181 an administrator polices funding calls but does not
 * run them: switch one off, suspend it with a reason, send the poster a note,
 * delete it. Editing a call and deciding its applications belong to the
 * organisation that posted it, so neither is offered here.
 *
 * "Add Funding" stays: it creates a call in the administrator's own name,
 * which makes them its poster, so the call is theirs to edit and decide.
 */
export default function AdminGrantsPage() {
  const { t } = useLingui()
  const toast = useToast()
  const auth = useAuth()
  // ?tab=applications so the dashboard's "awaiting review" tile can land on the
  // queue it counted. Read once, as the initial value: the tab strip is still
  // the thing that drives it, and rewriting the URL on every click would put
  // eight entries in the back stack for one visit.
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>(
    searchParams.get('tab') === 'applications' ? 'applications' : 'grants'
  )
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [suspending, setSuspending] = useState<AdminGrantRow | null>(null)
  const [noting, setNoting] = useState<AdminGrantRow | null>(null)

  // Grants data
  const { grants, loading: grantsLoading, refetch: refetchGrants } = useAdminGrants()
  const { updateGrant, loading: updateLoading } = useUpdateGrant()
  const { deleteGrant } = useDeleteGrant()

  // Mirrors migration 077's DELETE policy. Grants created before 077 have no
  // created_by and are OECS-only — showing the button to their original poster
  // would only produce a refusal, because the DB cannot know who that was.
  const isOecs = auth.can('grant:manage')
  const canDeleteGrant = (grant: Grant) =>
    isOecs || (!!grant.created_by && grant.created_by === auth.user?.id)

  // Applications data
  const { applications, loading: applicationsLoading } = useAdminGrantApplications({
    status: statusFilter || undefined,
  })

  // Application detail viewer
  const [viewingApplication, setViewingApplication] = useState<GrantApplication | null>(null)

  // New wizard applications match the step field names; legacy rows used ad-hoc keys
  const isWizardApplication = (data: Record<string, any>) =>
    GRANT_APPLICATION_STEPS.some((step) => step.fields.some((f) => data[f.name]))

  const handleToggleActive = async (grant: Grant) => {
    try {
      await updateGrant(grant.id, { is_active: !grant.is_active } as any)
      toast.success(`Grant ${grant.is_active ? 'deactivated' : 'activated'} successfully`)
      refetchGrants()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update grant')
    }
  }

  const formatAmountRange = (grant: Grant) => {
    if (grant.amount_min != null && grant.amount_max != null) {
      return `$${grant.amount_min.toLocaleString()} - $${grant.amount_max.toLocaleString()} ${grant.currency}`
    }
    if (grant.amount_min != null) {
      return `$${grant.amount_min.toLocaleString()} ${grant.currency}`
    }
    if (grant.amount_max != null) {
      return `$${grant.amount_max.toLocaleString()} ${grant.currency}`
    }
    return '-'
  }

  const isSuspended = (grant: Partial<Grant> | undefined) => grant?.moderation_status === 'suspended'

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Funding Management"
        subtitle={t`Oversee funding calls and see where applications stand`}
        imageSeed="admin-grants"
      />

      {/* Flat Tabs */}
      <div className="border-b border-ktip-sand-200 mb-6">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('grants')}
            className={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'grants'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-ktip-sand-300'
            )}
          >
            <DollarSign size={16} />
            Funding
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('applications')}
            className={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'applications'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-ktip-sand-300'
            )}
          >
            <FileText size={16} />
            Applications
          </button>
        </div>
      </div>

      {/* Grants Tab */}
      {activeTab === 'grants' && (
        <div className="animate-tab-enter">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm text-ktip-sand-600">
              <Trans>Only the organisation that posted a call can edit it. You can switch a call off, suspend it, or send the poster a note.</Trans>
            </p>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => setShowGrantModal(true)}>
              Add Funding
            </Button>
          </div>

          {/* Grants Table */}
          <div className="overflow-hidden">
            {grantsLoading ? (
              <div className="p-12 text-center text-gray-500">
                Loading funding calls...
              </div>
            ) : !grants?.length ? (
              <div className="p-12 text-center">
                <DollarSign size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-1">No funding calls found</h3>
                <p className="text-gray-500 text-sm">
                  Add your first funding call to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto scroll-cue-x">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ktip-sand-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"><Trans>Posted by</Trans></th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"><Trans>Organisation</Trans></th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Funding Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Focus</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deadline</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount Range</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"><Trans>Status</Trans></th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ktip-sand-200 stagger-rows">
                    {grants.map((grant) => (
                      <tr className="hover:bg-ktip-sand-50 transition-colors" key={grant.id}>
                        <td className="px-4 py-3">
                          <Link
                            to={`/grants/${grant.slug || grant.id}`}
                            className="font-medium text-gray-900 hover:text-ktip-ocean-600"
                          >
                            {grant.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {grant.poster?.display_name || <span className="text-gray-400">-</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {grant.employer ? (
                            <Link to={`/org/${grant.employer.slug}`} className="text-sm text-ktip-ocean-600 hover:underline">
                              {grantOrganisationName(grant.employer)}
                            </Link>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {grant.funding_type ? (
                            <Badge
                              size="sm"
                              className={FUNDING_TYPE_COLORS[grant.funding_type] || ''}
                            >
                              {fundingTypeLabel(grant.funding_type)}
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {grant.grant_type ? (
                            <Badge
                              size="sm"
                              className={GRANT_TYPE_COLORS[grant.grant_type] || ''}
                            >
                              {GRANT_TYPE_LABELS[grant.grant_type] || grant.grant_type}
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {grant.deadline ? (
                            <span className="text-sm text-gray-700">
                              {format(new Date(grant.deadline), 'MMM d, yyyy')}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {formatAmountRange(grant)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              size="sm"
                              className={
                                grant.is_active
                                  ? 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200'
                                  : 'bg-ktip-sand-100 text-gray-500 border-ktip-sand-200'
                              }
                            >
                              {grant.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            {isSuspended(grant) && (
                              <Badge size="sm" className="bg-red-50 text-red-700 border-red-200">
                                <Trans>Suspended</Trans>
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(grant)}
                              disabled={updateLoading}
                              className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-50"
                              title={grant.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {grant.is_active ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSuspending(grant)}
                              className={cn(
                                'p-1.5 text-gray-400 transition-colors',
                                isSuspended(grant) ? 'hover:text-ktip-tropical-600' : 'hover:text-red-600'
                              )}
                              title={isSuspended(grant) ? t`Restore` : t`Suspend`}
                            >
                              {isSuspended(grant) ? <RotateCcw size={16} /> : <Ban size={16} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setNoting(grant)}
                              className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                              title={t`Send feedback`}
                            >
                              <MessageSquare size={16} />
                            </button>
                            {canDeleteGrant(grant) && (
                              // applicationCount is null on purpose: the
                              // applications list here is status-filtered and
                              // excludes drafts, so it cannot give an honest
                              // per-grant total. The guard reads null on a live
                              // grant as "assume there are some".
                              <DeleteEntityControl
                                variant="icon"
                                noun="grant"
                                title={grant.title}
                                impact={describeGrantDeletion({
                                  isActive: grant.is_active,
                                  applicationCount: null,
                                })}
                                onDelete={() => deleteGrant(grant.id)}
                                onDeleted={refetchGrants}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Applications Tab — read-only since 181 */}
      {activeTab === 'applications' && (
        <div className="animate-tab-enter">
          <p className="mb-4 text-sm text-ktip-sand-600">
            <Trans>The organisation that posted a call decides its applications. This list is read-only.</Trans>
          </p>

          {/* Inline Status Filter */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.currentTarget.value)}
                className="px-3 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-hidden"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Not accepted</option>
              </select>
              {statusFilter && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>

          {/* Applications Table */}
          <div className="overflow-hidden">
            {applicationsLoading ? (
              <div className="p-12 text-center text-gray-500">
                Loading applications...
              </div>
            ) : !applications?.length ? (
              <div className="p-12 text-center">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-1">No applications found</h3>
                <p className="text-gray-500 text-sm">
                  {statusFilter
                    ? 'Try adjusting your filter'
                    : 'No grant applications have been submitted yet'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto scroll-cue-x">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ktip-sand-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Applicant</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Grant Title</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"><Trans>Decided by</Trans></th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ktip-sand-200 stagger-rows">
                    {applications.map((application) => (
                      <tr className="hover:bg-ktip-sand-50 transition-colors" key={application.id}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">
                            {application.applicant?.display_name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {application.grant?.title || 'Unknown Grant'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <OwnerCell row={application.grant as Partial<AdminGrantRow> | undefined} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            size="sm"
                            className={GRANT_APPLICATION_STATUS_COLORS[application.status] || ''}
                          >
                            {GRANT_APPLICATION_STATUS_LABELS[application.status] || application.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {format(new Date(application.created_at), 'MMM d, yyyy')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingApplication(application)}
                              className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                              title="View application"
                            >
                              <Eye size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Application Detail Modal */}
      <Modal
        open={!!viewingApplication}
        onClose={() => setViewingApplication(null)}
        title="Application Details"
        description={
          viewingApplication
            ? `${viewingApplication.applicant?.display_name || 'Unknown applicant'} — ${viewingApplication.grant?.title || 'Unknown grant'}`
            : undefined
        }
        size="lg"
      >
        {viewingApplication && (
          <div className="max-h-[70dvh] overflow-y-auto">
            <div className="mb-4 rounded-lg bg-ktip-sand-50 px-3 py-2 text-sm text-ktip-sand-600">
              <Trans>Decided by the posting organisation:</Trans>{' '}
              <OwnerCell row={viewingApplication.grant as Partial<AdminGrantRow> | undefined} />
            </div>
            {isWizardApplication(viewingApplication.application_data) ? (
              <ApplicationPreview
                title={viewingApplication.application_data.title || 'Untitled Application'}
                grantTitle={viewingApplication.grant?.title}
                data={viewingApplication.application_data}
              />
            ) : (
              // Legacy applications submitted before the wizard
              <div className="space-y-3">
                {Object.entries(viewingApplication.application_data).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-sm font-medium text-ktip-sand-600">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-sm text-ktip-sand-900 whitespace-pre-wrap">
                      {String(value || '-')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create only. Editing a call is the poster's (181). */}
      <AdminGrantFormModal
        open={showGrantModal}
        grant={null}
        onClose={() => setShowGrantModal(false)}
        onSaved={() => refetchGrants()}
      />

      <GrantSuspensionModal
        grant={suspending}
        onClose={() => setSuspending(null)}
        onDone={() => refetchGrants()}
      />

      <AdminNoteModal
        open={!!noting}
        onClose={() => setNoting(null)}
        targetType="grant"
        targetId={noting?.id ?? null}
        targetTitle={noting?.title ?? ''}
      />
    </div>
  )
}
