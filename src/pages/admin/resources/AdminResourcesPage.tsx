import { createSignal, For, Show, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { useAdminResources, useDeleteResource } from '../../../hooks/useResources'
import { useToast } from '../../../contexts/ToastContext'
import { AdminResourceFormModal } from './AdminResourceFormModal'
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  BookOpen,
} from 'lucide-solid'
import {
  RESOURCE_TYPE_LABELS,
  RESOURCE_TYPE_COLORS,
  RESOURCE_CATEGORY_LABELS,
} from '../../../lib/constants'
import { formatDate } from '../../../lib/utils'
import type { Resource } from '../../../types'

export default function AdminResourcesPage() {
  const toast = useToast()
  const { resources, refetch } = useAdminResources()
  const { deleteResource, loading: deleteLoading } = useDeleteResource()

  const [showModal, setShowModal] = createSignal(false)
  const [editingResource, setEditingResource] = createSignal<Resource | null>(null)

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
    <AdminLayout>
      {/* Dark Header Band */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-gray-400 uppercase tracking-wider">Resource Management</p>
            <h1 class="text-2xl font-display font-bold text-white mt-1">Resources</h1>
            <p class="text-sm text-gray-400 mt-1">Manage knowledge base articles, guides, and case studies</p>
          </div>
          <Button icon={<Plus size={16} />} onClick={openCreate}>
            Add Resource
          </Button>
        </div>
      </div>

      {/* Table */}
      <div class="border border-gray-200 rounded-lg overflow-hidden">
        <Suspense
          fallback={
            <div class="p-6 space-y-4">
              {[1, 2, 3].map(() => (
                <div class="h-16 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          }
        >
          <Show
            when={resources()?.length}
            fallback={
              <div class="text-center py-16">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen size={32} class="text-gray-400" />
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-1">No resources yet</h3>
                <p class="text-gray-600 text-sm mb-4">Create your first resource to get started.</p>
                <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
                  Add Resource
                </Button>
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-gray-200 bg-gray-50">
                    <th class="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">Resource</th>
                    <th class="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Type</th>
                    <th class="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Category</th>
                    <th class="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Status</th>
                    <th class="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">Date</th>
                    <th class="text-right text-xs font-semibold text-gray-600 uppercase tracking-wider px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <For each={resources()}>
                    {(resource) => (
                      <tr class="hover:bg-gray-50/50 transition-colors">
                        <td class="px-6 py-4">
                          <div>
                            <p class="font-medium text-gray-900 line-clamp-1">{resource.title}</p>
                            <Show when={resource.description}>
                              <p class="text-xs text-gray-500 line-clamp-1 mt-0.5">{resource.description}</p>
                            </Show>
                          </div>
                        </td>
                        <td class="px-4 py-4">
                          <Badge size="sm" class={RESOURCE_TYPE_COLORS[resource.resource_type] || ''}>
                            {RESOURCE_TYPE_LABELS[resource.resource_type] || resource.resource_type}
                          </Badge>
                        </td>
                        <td class="px-4 py-4">
                          <span class="text-sm text-gray-600">
                            {resource.category ? RESOURCE_CATEGORY_LABELS[resource.category] || resource.category : '—'}
                          </span>
                        </td>
                        <td class="px-4 py-4">
                          <Show
                            when={resource.is_published}
                            fallback={
                              <Badge size="sm" class="bg-yellow-100 text-yellow-700 border-yellow-200">
                                <EyeOff size={12} />
                                Draft
                              </Badge>
                            }
                          >
                            <Badge size="sm" class="bg-ktip-tropical-100 text-ktip-tropical-700 border-ktip-tropical-200">
                              <Eye size={12} />
                              Published
                            </Badge>
                          </Show>
                        </td>
                        <td class="px-4 py-4">
                          <span class="text-xs text-gray-500">{formatDate(resource.created_at)}</span>
                        </td>
                        <td class="px-6 py-4">
                          <div class="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(resource)}
                              class="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(resource)}
                              disabled={deleteLoading()}
                              class="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
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

      {/* Form Modal */}
      <AdminResourceFormModal
        open={showModal()}
        onClose={() => setShowModal(false)}
        resource={editingResource()}
        onSaved={handleSaved}
      />
    </AdminLayout>
  )
}
