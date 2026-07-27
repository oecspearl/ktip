import { createSignal, Show, For, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { useGrants, useUpdateGrant } from '../../../hooks/useGrants'
import { useAdminGrantApplications, useAdminApplicationActions } from '../../../hooks/useAdminDashboard'
import { useToast } from '../../../contexts/ToastContext'
import {
  GRANT_TYPE_LABELS,
  GRANT_TYPE_COLORS,
  GRANT_APPLICATION_STATUS_LABELS,
  GRANT_APPLICATION_STATUS_COLORS,
} from '../../../lib/constants'
import { format } from 'date-fns'
import { cn } from '../../../lib/utils'
import type { Grant, GrantApplicationStatus } from '../../../types'
import {
  DollarSign,
  Plus,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
} from 'lucide-solid'
import AdminGrantFormModal from './AdminGrantFormModal'

type TabId = 'grants' | 'applications'

function AdminGrantsContent() {
  const toast = useToast()
  const [activeTab, setActiveTab] = createSignal<TabId>('grants')
  const [showGrantModal, setShowGrantModal] = createSignal(false)
  const [editingGrant, setEditingGrant] = createSignal<Grant | null>(null)
  const [statusFilter, setStatusFilter] = createSignal('')

  // Grants data
  const { grants, refetch: refetchGrants } = useGrants()
  const { updateGrant, loading: updateLoading } = useUpdateGrant()

  // Applications data
  const { applications, refetch: refetchApplications } = useAdminGrantApplications({
    get status() { return statusFilter() || undefined },
  })
  const { updateApplicationStatus, loading: actionLoading } = useAdminApplicationActions()

  // Confirm modal state for application actions
  const [confirmAction, setConfirmAction] = createSignal<{
    applicationId: string
    status: GrantApplicationStatus
    applicantName: string
  } | null>(null)

  const handleOpenCreate = () => {
    setEditingGrant(null)
    setShowGrantModal(true)
  }

  const handleOpenEdit = (grant: Grant) => {
    setEditingGrant(grant)
    setShowGrantModal(true)
  }

  const handleToggleActive = async (grant: Grant) => {
    try {
      await updateGrant(grant.id, { is_active: !grant.is_active } as any)
      toast.success(`Grant ${grant.is_active ? 'deactivated' : 'activated'} successfully`)
      refetchGrants()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update grant')
    }
  }

  const handleApplicationAction = async () => {
    const action = confirmAction()
    if (!action) return

    try {
      await updateApplicationStatus(action.applicationId, action.status)
      toast.success(
        `Application ${GRANT_APPLICATION_STATUS_LABELS[action.status].toLowerCase()} successfully`
      )
      setConfirmAction(null)
      refetchApplications()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update application status')
    }
  }

  const handleMarkUnderReview = async (applicationId: string) => {
    try {
      await updateApplicationStatus(applicationId, 'under_review')
      toast.success('Application marked as under review')
      refetchApplications()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update application status')
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

  const handleGrantSaved = () => {
    refetchGrants()
  }

  return (
    <div>
      {/* Dark Header Band */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p class="text-gray-400 text-xs uppercase tracking-widest mb-1">Administration</p>
            <h1 class="text-2xl font-bold text-white">
              Grant Management
            </h1>
            <p class="mt-1 text-gray-400 text-sm">
              Manage grants and review applications
            </p>
          </div>
        </div>
      </div>

      {/* Flat Tabs */}
      <div class="border-b border-gray-200 mb-6">
        <div class="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('grants')}
            class={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab() === 'grants'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <DollarSign size={16} />
            Grants
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('applications')}
            class={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab() === 'applications'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <FileText size={16} />
            Applications
          </button>
        </div>
      </div>

      {/* Grants Tab */}
      <Show when={activeTab() === 'grants'}>
        <div class="animate-tab-enter">
          {/* Create Grant Button */}
          <div class="flex justify-end mb-4">
            <Button size="sm" icon={<Plus size={16} />} onClick={handleOpenCreate}>
              Create Grant
            </Button>
          </div>

          {/* Grants Table */}
          <div class="overflow-hidden">
            <Suspense
              fallback={
                <div class="p-12 text-center text-gray-500">
                  Loading grants...
                </div>
              }
            >
              <Show
                when={grants()?.length}
                fallback={
                  <div class="p-12 text-center">
                    <DollarSign size={48} class="mx-auto text-gray-300 mb-4" />
                    <h3 class="text-lg font-semibold text-gray-700 mb-1">No grants found</h3>
                    <p class="text-gray-500 text-sm">
                      Create your first grant to get started
                    </p>
                  </div>
                }
              >
                <div class="overflow-x-auto">
                  <table class="w-full">
                    <thead>
                      <tr class="border-b border-gray-200">
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Deadline</th>
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount Range</th>
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                        <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                      <For each={grants()}>
                        {(grant) => (
                          <tr class="hover:bg-gray-50 transition-colors">
                            <td class="px-4 py-3">
                              <span class="font-medium text-gray-900">{grant.title}</span>
                            </td>
                            <td class="px-4 py-3">
                              <Show when={grant.grant_type} fallback={<span class="text-sm text-gray-400">-</span>}>
                                <Badge
                                  size="sm"
                                  class={GRANT_TYPE_COLORS[grant.grant_type!] || ''}
                                >
                                  {GRANT_TYPE_LABELS[grant.grant_type!] || grant.grant_type}
                                </Badge>
                              </Show>
                            </td>
                            <td class="px-4 py-3">
                              <Show when={grant.deadline} fallback={<span class="text-sm text-gray-400">-</span>}>
                                <span class="text-sm text-gray-700">
                                  {format(new Date(grant.deadline!), 'MMM d, yyyy')}
                                </span>
                              </Show>
                            </td>
                            <td class="px-4 py-3">
                              <span class="text-sm text-gray-700">
                                {formatAmountRange(grant)}
                              </span>
                            </td>
                            <td class="px-4 py-3">
                              <Badge
                                size="sm"
                                class={
                                  grant.is_active
                                    ? 'bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200'
                                    : 'bg-gray-100 text-gray-500 border-gray-200'
                                }
                              >
                                {grant.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td class="px-4 py-3">
                              <div class="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(grant)}
                                  class="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                                  title="Edit grant"
                                >
                                  <FileText size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(grant)}
                                  disabled={updateLoading()}
                                  class="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-50"
                                  title={grant.is_active ? 'Deactivate' : 'Activate'}
                                >
                                  <Show when={grant.is_active} fallback={<Eye size={16} />}>
                                    <EyeOff size={16} />
                                  </Show>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </Suspense>
          </div>
        </div>
      </Show>

      {/* Applications Tab */}
      <Show when={activeTab() === 'applications'}>
        <div class="animate-tab-enter">
          {/* Inline Status Filter */}
          <div class="mb-6">
            <div class="flex flex-col sm:flex-row gap-3">
              <select
                value={statusFilter()}
                onChange={(e) => setStatusFilter(e.currentTarget.value)}
                class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <Show when={statusFilter()}>
                <button
                  type="button"
                  onClick={() => setStatusFilter('')}
                  class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
                >
                  Clear filter
                </button>
              </Show>
            </div>
          </div>

          {/* Applications Table */}
          <div class="overflow-hidden">
            <Suspense
              fallback={
                <div class="p-12 text-center text-gray-500">
                  Loading applications...
                </div>
              }
            >
              <Show
                when={applications()?.length}
                fallback={
                  <div class="p-12 text-center">
                    <FileText size={48} class="mx-auto text-gray-300 mb-4" />
                    <h3 class="text-lg font-semibold text-gray-700 mb-1">No applications found</h3>
                    <p class="text-gray-500 text-sm">
                      {statusFilter()
                        ? 'Try adjusting your filter'
                        : 'No grant applications have been submitted yet'}
                    </p>
                  </div>
                }
              >
                <div class="overflow-x-auto">
                  <table class="w-full">
                    <thead>
                      <tr class="border-b border-gray-200">
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Applicant</th>
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Grant Title</th>
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted</th>
                        <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                      <For each={applications()}>
                        {(application) => (
                          <tr class="hover:bg-gray-50 transition-colors">
                            <td class="px-4 py-3">
                              <span class="font-medium text-gray-900">
                                {application.applicant?.display_name || 'Unknown'}
                              </span>
                            </td>
                            <td class="px-4 py-3">
                              <span class="text-sm text-gray-700">
                                {application.grant?.title || 'Unknown Grant'}
                              </span>
                            </td>
                            <td class="px-4 py-3">
                              <Badge
                                size="sm"
                                class={GRANT_APPLICATION_STATUS_COLORS[application.status] || ''}
                              >
                                {GRANT_APPLICATION_STATUS_LABELS[application.status] || application.status}
                              </Badge>
                            </td>
                            <td class="px-4 py-3">
                              <span class="text-sm text-gray-700">
                                {format(new Date(application.created_at), 'MMM d, yyyy')}
                              </span>
                            </td>
                            <td class="px-4 py-3">
                              <div class="flex items-center justify-end gap-1">
                                <Show when={application.status !== 'approved'}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmAction({
                                        applicationId: application.id,
                                        status: 'approved',
                                        applicantName: application.applicant?.display_name || 'this applicant',
                                      })
                                    }
                                    class="p-1.5 text-gray-400 hover:text-ktip-tropical-600 transition-colors"
                                    title="Approve"
                                  >
                                    <CheckCircle size={16} />
                                  </button>
                                </Show>
                                <Show when={application.status !== 'rejected'}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmAction({
                                        applicationId: application.id,
                                        status: 'rejected',
                                        applicantName: application.applicant?.display_name || 'this applicant',
                                      })
                                    }
                                    class="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                    title="Reject"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </Show>
                                <Show when={application.status === 'pending'}>
                                  <button
                                    type="button"
                                    onClick={() => handleMarkUnderReview(application.id)}
                                    disabled={actionLoading()}
                                    class="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors disabled:opacity-50"
                                    title="Mark Under Review"
                                  >
                                    <Clock size={16} />
                                  </button>
                                </Show>
                              </div>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </Suspense>
          </div>
        </div>
      </Show>

      {/* Grant Form Modal */}
      <AdminGrantFormModal
        open={showGrantModal()}
        grant={editingGrant()}
        onClose={() => {
          setShowGrantModal(false)
          setEditingGrant(null)
        }}
        onSaved={handleGrantSaved}
      />

      {/* Confirm Modal for Application Actions */}
      <ConfirmModal
        open={!!confirmAction()}
        title={
          confirmAction()?.status === 'approved'
            ? 'Approve Application'
            : 'Reject Application'
        }
        message={
          confirmAction()?.status === 'approved'
            ? `Are you sure you want to approve the application from "${confirmAction()?.applicantName}"?`
            : `Are you sure you want to reject the application from "${confirmAction()?.applicantName}"? This action cannot be easily undone.`
        }
        confirmLabel={
          confirmAction()?.status === 'approved' ? 'Approve' : 'Reject'
        }
        confirmVariant={confirmAction()?.status === 'rejected' ? 'danger' : 'primary'}
        loading={actionLoading()}
        onConfirm={handleApplicationAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}

export default function AdminGrantsPage() {
  return (
    <AdminLayout>
      <AdminGrantsContent />
    </AdminLayout>
  )
}
