import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { useAdminGrievances, useUpdateGrievance } from '../../../hooks/useGrievances'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_CATEGORY_COLORS,
  GRIEVANCE_STATUS_LABELS,
  GRIEVANCE_STATUS_COLORS,
} from '../../../lib/constants'
import { formatDate, getInitials, generateAvatarColor } from '../../../lib/utils'
import type { Grievance, GrievanceStatus } from '../../../types'
import {
  Flag,
  Eye,
  CheckCircle,
  XCircle,
  ExternalLink,
  Filter,
  X,
  Clock,
  FileText,
} from 'lucide-react'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { PageHero } from '../../../components/layout/PageHero'

export default function AdminGrievancesPage() {
  const auth = useAuth()
  const toast = useToast()

  usePageTitle('Grievance Management')

  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const { grievances, loading, refetch } = useAdminGrievances({
    status: statusFilter,
    category: categoryFilter,
  })

  const { updateGrievance, loading: updateLoading } = useUpdateGrievance()

  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [detailStatus, setDetailStatus] = useState<GrievanceStatus>('pending')

  const openDetailModal = (grievance: Grievance) => {
    setSelectedGrievance(grievance)
    setAdminNotes(grievance.admin_notes || '')
    setDetailStatus(grievance.status)
    setShowDetailModal(true)
  }

  const handleStatusChange = async (grievanceId: string, newStatus: GrievanceStatus) => {
    try {
      const updates: Record<string, any> = { status: newStatus }

      if (newStatus === 'resolved' || newStatus === 'dismissed') {
        updates.resolved_by = auth.user!.id
        updates.resolved_at = new Date().toISOString()
      }

      await updateGrievance(grievanceId, updates)
      toast.success(`Report ${GRIEVANCE_STATUS_LABELS[newStatus].toLowerCase()}`)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update report')
    }
  }

  const handleDetailSave = async () => {
    const grievance = selectedGrievance
    if (!grievance) return

    try {
      const updates: Record<string, any> = {
        status: detailStatus,
        admin_notes: adminNotes || null,
      }

      if (
        (detailStatus === 'resolved' || detailStatus === 'dismissed') &&
        grievance.status !== 'resolved' &&
        grievance.status !== 'dismissed'
      ) {
        updates.resolved_by = auth.user!.id
        updates.resolved_at = new Date().toISOString()
      }

      await updateGrievance(grievance.id, updates)
      toast.success('Report updated successfully')
      setShowDetailModal(false)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update report')
    }
  }

  const clearFilters = () => {
    setStatusFilter('')
    setCategoryFilter('')
  }

  const hasFilters = statusFilter || categoryFilter

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Grievance Management"
        subtitle="Review and manage user reports"
        imageSeed="admin-grievances"
      />

      {/* Filter Bar */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-ktip-sand-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Statuses</option>
            {Object.entries(GRIEVANCE_STATUS_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.currentTarget.value)}
            className="border border-ktip-sand-200 rounded-lg px-3 py-2 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
          >
            <option value="">All Categories</option>
            {Object.entries(GRIEVANCE_CATEGORY_LABELS).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-ktip-sand-500 hover:text-ktip-sand-700 transition-colors"
            >
              <X size={14} />
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Grievances Table */}
      <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          </div>
        ) : grievances && grievances.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ktip-sand-100 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-ktip-sand-500 uppercase tracking-wider">Reporter</th>
                    <th className="px-4 py-3 text-xs font-medium text-ktip-sand-500 uppercase tracking-wider">Reported User</th>
                    <th className="px-4 py-3 text-xs font-medium text-ktip-sand-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-xs font-medium text-ktip-sand-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-ktip-sand-500 uppercase tracking-wider">Submitted</th>
                    <th className="px-4 py-3 text-xs font-medium text-ktip-sand-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ktip-sand-100 stagger-rows">
                  {grievances.map((grievance) => {
                    const reporterName = grievance.reporter?.display_name || 'Unknown'
                    const reportedName = grievance.reported_user?.display_name || 'Unknown'

                    return (
                      <tr className="hover:bg-ktip-sand-50/50 transition-colors" key={grievance.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${generateAvatarColor(reporterName)}`}
                            >
                              {getInitials(reporterName)}
                            </div>
                            <span className="text-sm text-ktip-sand-900 font-medium truncate max-w-[120px]">
                              {reporterName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${generateAvatarColor(reportedName)}`}
                            >
                              {getInitials(reportedName)}
                            </div>
                            <span className="text-sm text-ktip-sand-900 font-medium truncate max-w-[120px]">
                              {reportedName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${GRIEVANCE_CATEGORY_COLORS[grievance.category] || 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'}`}
                          >
                            {GRIEVANCE_CATEGORY_LABELS[grievance.category] || grievance.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${GRIEVANCE_STATUS_COLORS[grievance.status] || 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'}`}
                          >
                            {GRIEVANCE_STATUS_LABELS[grievance.status] || grievance.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-ktip-sand-500">{formatDate(grievance.created_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {grievance.status === 'pending' && (
                              <button
                                onClick={() => handleStatusChange(grievance.id, 'under_review')}
                                className="p-1.5 text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg transition-colors"
                                title="Mark Under Review"
                              >
                                <Eye size={16} />
                              </button>
                            )}
                            {grievance.status !== 'resolved' && (
                              <button
                                onClick={() => handleStatusChange(grievance.id, 'resolved')}
                                className="p-1.5 text-ktip-tropical-700 hover:bg-ktip-tropical-50 rounded-lg transition-colors"
                                title="Resolve"
                              >
                                <CheckCircle size={16} />
                              </button>
                            )}
                            {grievance.status !== 'dismissed' && (
                              <button
                                onClick={() => handleStatusChange(grievance.id, 'dismissed')}
                                className="p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100 rounded-lg transition-colors"
                                title="Dismiss"
                              >
                                <XCircle size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => openDetailModal(grievance)}
                              className="p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <FileText size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-ktip-sand-100 stagger-children">
              {grievances.map((grievance) => {
                const reporterName = grievance.reporter?.display_name || 'Unknown'
                const reportedName = grievance.reported_user?.display_name || 'Unknown'

                return (
                  <div className="p-4 space-y-3" key={grievance.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${generateAvatarColor(reportedName)}`}
                          >
                            {getInitials(reportedName)}
                          </div>
                          <span className="text-sm font-semibold text-ktip-sand-900">{reportedName}</span>
                        </div>
                        <p className="text-xs text-ktip-sand-500">reported by {reporterName}</p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${GRIEVANCE_STATUS_COLORS[grievance.status] || 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'}`}
                      >
                        {GRIEVANCE_STATUS_LABELS[grievance.status] || grievance.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${GRIEVANCE_CATEGORY_COLORS[grievance.category] || 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'}`}
                      >
                        {GRIEVANCE_CATEGORY_LABELS[grievance.category] || grievance.category}
                      </span>
                      <span className="text-xs text-ktip-sand-400 flex items-center gap-1">
                        <Clock size={10} />
                        {formatDate(grievance.created_at)}
                      </span>
                    </div>

                    <p className="text-sm text-ktip-sand-600 line-clamp-2">{grievance.description}</p>

                    <div className="flex items-center gap-2 pt-1">
                      {grievance.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(grievance.id, 'under_review')}>
                          Review
                        </Button>
                      )}
                      {grievance.status !== 'resolved' && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(grievance.id, 'resolved')}>
                          Resolve
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openDetailModal(grievance)}>
                        Details
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Flag size={32} className="text-ktip-sand-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No reports found</h3>
            <p className="text-ktip-sand-500 text-sm">
              {hasFilters ? 'Try adjusting your filters.' : 'No user reports have been submitted yet.'}
            </p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedGrievance && (
        <Modal
          open={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title="Report Details"
          size="lg"
        >
          {(() => {
            const g = selectedGrievance
            const reporterName = g.reporter?.display_name || 'Unknown'
            const reportedName = g.reported_user?.display_name || 'Unknown'

            return (
              <div className="space-y-5">
                {/* Users */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-ktip-sand-500 mb-1">Reporter</p>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${generateAvatarColor(reporterName)}`}
                      >
                        {getInitials(reporterName)}
                      </div>
                      <span className="text-sm font-medium text-ktip-sand-900">{reporterName}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-ktip-sand-500 mb-1">Reported User</p>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${generateAvatarColor(reportedName)}`}
                      >
                        {getInitials(reportedName)}
                      </div>
                      <span className="text-sm font-medium text-ktip-sand-900">{reportedName}</span>
                    </div>
                  </div>
                </div>

                {/* Category & Status */}
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${GRIEVANCE_CATEGORY_COLORS[g.category] || 'bg-ktip-sand-100 text-gray-700 border-ktip-sand-200'}`}
                  >
                    {GRIEVANCE_CATEGORY_LABELS[g.category] || g.category}
                  </span>
                  <span className="text-xs text-ktip-sand-400 flex items-center gap-1">
                    <Clock size={12} />
                    Submitted {formatDate(g.created_at)}
                  </span>
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs font-medium text-ktip-sand-500 mb-1">Description</p>
                  <p className="text-sm text-ktip-sand-800 whitespace-pre-wrap bg-ktip-sand-50 rounded-lg p-3">
                    {g.description}
                  </p>
                </div>

                {/* Evidence URL */}
                {g.evidence_url && (
                  <div>
                    <p className="text-xs font-medium text-ktip-sand-500 mb-1">Evidence</p>
                    <a
                      href={g.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 transition-colors"
                    >
                      <ExternalLink size={14} />
                      View evidence
                    </a>
                  </div>
                )}

                {/* Context */}
                {g.context && (
                  <div>
                    <p className="text-xs font-medium text-ktip-sand-500 mb-1">Where it happened</p>
                    <p className="text-sm text-ktip-sand-700">{g.context}</p>
                  </div>
                )}

                <hr className="border-ktip-sand-100" />

                {/* Admin Controls */}
                <div>
                  <label className="block text-xs font-medium text-ktip-sand-500 mb-1">Status</label>
                  <select
                    value={detailStatus}
                    onChange={(e) => setDetailStatus(e.currentTarget.value as GrievanceStatus)}
                    className="w-full border border-ktip-sand-200 rounded-xl px-3 py-2.5 text-sm bg-ktip-cream focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500"
                  >
                    {Object.entries(GRIEVANCE_STATUS_LABELS).map(([value, label]) => (
                      <option value={value} key={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <Textarea
                  label="Admin Notes"
                  placeholder="Add internal notes about this report..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.currentTarget.value)}
                  rows={3}
                  fullWidth
                />

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setShowDetailModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleDetailSave}
                    loading={updateLoading}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )
          })()}
        </Modal>
      )}
    </>
  )
}
