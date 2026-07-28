import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { useAdminResources, useDeleteResource } from '../../../hooks/useResources'
import { useToast } from '../../../contexts/ToastContext'
import { AdminResourceFormModal } from './AdminResourceFormModal'
import { PageHero } from '../../../components/layout/PageHero'
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  BookOpen,
} from 'lucide-react'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_CATEGORY_LABELS,
} from '../../../lib/constants'
import { formatDate } from '../../../lib/utils'
import type { Resource } from '../../../types'

export default function AdminResourcesPage() {
  const toast = useToast()
  const { resources, loading, refetch } = useAdminResources()
  const { deleteResource, loading: deleteLoading } = useDeleteResource()

  const [showModal, setShowModal] = useState(false)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)

  const openCreate = () => {
    setEditingResource(null)
    setShowModal(true)
  }

  const openEdit = (resource: Resource) => {
    setEditingResource(resource)
    setShowModal(true)
  }

  const handleDelete = async (resource: Resource) => {
    if (!confirm(`Are you sure you want to delete "${resource.title}"?`)) return
    try {
      await deleteResource(resource.id)
      toast.success('Resource deleted')
      refetch()
    } catch {
      toast.error('Failed to delete resource')
    }
  }

  const handleSaved = () => {
    setShowModal(false)
    refetch()
  }

  return (
    <>
      <PageHero
        inset
        compact
        eyebrow="Resource Management"
        title="Resources"
        subtitle="Manage knowledge base articles, guides, and case studies"
        imageSeed="admin-resources"
        actions={
          <Button icon={<Plus size={16} />} onClick={openCreate}>
            Add Resource
          </Button>
        }
      />

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !resources?.length ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No resources yet</h3>
            <p className="text-gray-600 text-sm mb-4">Create your first resource to get started.</p>
            <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
              Add Resource
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">Resource</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Category</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {resources.map((resource) => (
                  <tr key={resource.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900 line-clamp-1">{resource.title}</p>
                        {resource.description && (
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{resource.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge size="sm" className={RESOURCE_TYPE_COLORS[resource.resource_type] || ''}>
                        {RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-600">
                        {resource.category ? RESOURCE_CATEGORY_LABELS[resource.category] || resource.category : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {resource.is_published ? (
                        <Badge size="sm" className="bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200">
                          <Eye size={12} />
                          Published
                        </Badge>
                      ) : (
                        <Badge size="sm" className="bg-ktip-sun-100 text-ktip-sun-700 border-ktip-sun-200">
                          <EyeOff size={12} />
                          Draft
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs text-gray-500">{formatDate(resource.created_at)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(resource)}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(resource)}
                          disabled={deleteLoading}
                          className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
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

      {/* Form Modal */}
      <AdminResourceFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        resource={editingResource}
        onSaved={handleSaved}
      />
    </>
  )
}
