import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Modal } from '../../../components/ui/Modal'
import { useAdminIntegrations, useIntegrationMutations } from '../../../hooks/useIntegrations'
import { useToast } from '../../../contexts/ToastContext'
import type { Integration } from '../../../types'
import { Puzzle, Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { INTEGRATION_CATEGORY_LABELS } from '../../integrations/IntegrationsPage'

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'productivity',
  website_url: '',
  logo_url: '',
  sort_order: 0,
}

export default function AdminIntegrationsPage() {
  const toast = useToast()

  usePageTitle('Integration Directory')

  const { integrations, loading, refetch } = useAdminIntegrations()
  const { createIntegration, updateIntegration, deleteIntegration, loading: mutating } =
    useIntegrationMutations()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Integration | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [confirmDelete, setConfirmDelete] = useState<Integration | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  const openEdit = (integration: Integration) => {
    setEditing(integration)
    setForm({
      name: integration.name,
      description: integration.description,
      category: integration.category,
      website_url: integration.website_url,
      logo_url: integration.logo_url || '',
      sort_order: integration.sort_order,
    })
    setShowModal(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.description.trim() || !form.website_url.trim()) return

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        website_url: form.website_url.trim(),
        logo_url: form.logo_url.trim() || undefined,
        sort_order: form.sort_order,
      }
      if (editing) {
        await updateIntegration(editing.id, payload as Partial<Integration>)
        toast.success('Integration updated')
      } else {
        await createIntegration(payload)
        toast.success('Integration created (unpublished)')
      }
      setShowModal(false)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save integration')
    }
  }

  const togglePublish = async (integration: Integration) => {
    try {
      await updateIntegration(integration.id, { is_published: !integration.is_published })
      toast.success(integration.is_published ? 'Unpublished' : 'Published')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteIntegration(confirmDelete.id)
      toast.success('Integration deleted')
      setConfirmDelete(null)
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-ktip-sand-500 mb-2">
            <span>Administration</span>
            <span>/</span>
            <span className="text-ktip-sand-900 font-medium">Integrations</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center">
              <Puzzle size={20} className="text-ktip-ocean-600" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-ktip-sand-900">Integration Directory</h1>
              <p className="text-ktip-sand-500 text-sm">Curate external tools shown at /integrations</p>
            </div>
          </div>
        </div>
        <Button onClick={openCreate} icon={<Plus size={16} />}>
          Add Integration
        </Button>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-card border border-ktip-sand-100 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
            <div className="h-12 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          </div>
        ) : integrations && integrations.length > 0 ? (
          <div className="divide-y divide-ktip-sand-100">
            {integrations.map((integration) => (
              <div key={integration.id} className="flex items-center justify-between gap-3 p-4 hover:bg-ktip-sand-50/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {integration.logo_url ? (
                    <img
                      src={integration.logo_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-contain bg-ktip-sand-50 border border-ktip-sand-100 p-0.5 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-ktip-ocean-100 rounded-lg flex items-center justify-center shrink-0">
                      <Puzzle size={18} className="text-ktip-ocean-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ktip-sand-900 truncate flex items-center gap-2">
                      {integration.name}
                      <a
                        href={integration.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ktip-ocean-600 hover:text-ktip-ocean-700"
                        aria-label={`Open ${integration.name} website`}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </p>
                    <p className="text-xs text-ktip-sand-500">
                      {INTEGRATION_CATEGORY_LABELS[integration.category] || integration.category}
                      {' · '}
                      {integration.is_published ? 'Published' : 'Draft'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => togglePublish(integration)}
                    disabled={mutating}
                    className={`p-2 rounded-lg transition-colors ${
                      integration.is_published
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-ktip-sand-400 hover:bg-ktip-sand-100'
                    }`}
                    title={integration.is_published ? 'Unpublish' : 'Publish'}
                  >
                    {integration.is_published ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    onClick={() => openEdit(integration)}
                    className="p-2 text-ktip-ocean-600 hover:bg-ktip-ocean-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(integration)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Puzzle size={32} className="text-ktip-sand-400" />
            </div>
            <h3 className="text-lg font-semibold text-ktip-sand-900 mb-1">No integrations yet</h3>
            <p className="text-ktip-sand-500 text-sm">Add your first integration to start the directory.</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Integration' : 'Add Integration'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            fullWidth
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ktip-sand-700">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="border border-ktip-sand-200 rounded-xl px-3 py-3 bg-ktip-sand-50/50 text-sm focus:outline-none focus:ring-2 focus:border-ktip-ocean-500 focus:ring-ktip-ocean-500/20 focus:bg-white"
              >
                {Object.entries(INTEGRATION_CATEGORY_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </div>
            <Input
              label="Sort order"
              type="number"
              value={String(form.sort_order)}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              fullWidth
            />
          </div>
          <Input
            label="Website URL"
            type="url"
            value={form.website_url}
            onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
            placeholder="https://..."
            fullWidth
          />
          <Input
            label="Logo URL (optional)"
            type="url"
            value={form.logo_url}
            onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
            placeholder="https://..."
            fullWidth
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutating}>
              {editing ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Integration" size="sm">
          <p className="text-sm text-ktip-sand-600 mb-6">
            Delete "{confirmDelete.name}"? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDelete} loading={mutating}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
