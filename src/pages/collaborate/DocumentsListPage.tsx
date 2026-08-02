import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useDocuments, useSharedDocuments, useDeleteDocument } from '../../hooks/useDocuments'
import { usePageTitle } from '../../hooks/usePageTitle'
import { formatRelativeTime, debounce } from '../../lib/utils'
import { Plus, Search, FileText, Trash2, Users } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'

export default function DocumentsListPage() {
  usePageTitle('My Documents')
  const navigate = useNavigate()

  const [searchQuery, setSearchQuery] = useState('')
  const documents = useDocuments({ search: searchQuery })
  const shared = useSharedDocuments()
  const { deleteDocument } = useDeleteDocument()

  const debouncedSearch = useMemo(() => debounce((value: string) => setSearchQuery(value), 300), [])

  const handleDelete = async (e: React.MouseEvent, docId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this document? This cannot be undone.')) return
    try {
      await deleteDocument(docId)
      documents.refetch()
    } catch {
      // Error handled by hook
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Collaboration Tools"
        title="My Documents"
        imageSeed="documents"
        compact
        breadcrumb={[
          { label: 'Home', href: '/' },
          { label: 'Collaborate', href: '/collaborate' },
          { label: 'Documents' },
        ]}
      />

      {/* Content */}
      <div className="bg-ktip-sand-50 py-8">
        <div className="max-w-page-narrow mx-auto px-4">
          {/* Actions Bar */}
          <div data-tutorial="collab-list-actions" className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ktip-sand-400" />
              <input
                type="text"
                placeholder="Search documents..."
                onChange={(e) => debouncedSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-ktip-sand-200 rounded-lg bg-ktip-sand-50/50 focus:bg-ktip-cream focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/collaborate/document/new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 btn-brand rounded-lg font-medium text-sm"
            >
              <Plus size={16} />
              New Document
            </button>
          </div>

          {/* Document List */}
          {documents.loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border border-ktip-sand-200 p-4 animate-pulse">
                  <div className="h-5 w-48 bg-ktip-sand-200 rounded mb-2" />
                  <div className="h-4 w-32 bg-ktip-sand-100 rounded" />
                </div>
              ))}
            </div>
          ) : documents.documents && documents.documents.length > 0 ? (
            <div className="space-y-2">
              {documents.documents.map((doc) => (
                <Link
                  key={doc.id}
                  to={`/collaborate/document/${doc.id}`}
                  className="flex items-center justify-between border border-ktip-sand-200 p-4 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-700 transition-colors truncate">
                      {doc.title}
                    </h3>
                    <p className="text-sm text-ktip-sand-500 mt-0.5">
                      Edited {formatRelativeTime(doc.updated_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, doc.id)}
                    className="p-2 rounded-lg text-ktip-sand-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete document"
                  >
                    <Trash2 size={16} />
                  </button>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText size={32} className="text-ktip-sand-400" />
              </div>
              <h3 className="text-lg font-semibold text-ktip-sand-800 mb-1">No documents yet</h3>
              <p className="text-sm text-ktip-sand-500 mb-4">
                Create your first document to get started.
              </p>
              <button
                type="button"
                onClick={() => navigate('/collaborate/document/new')}
                className="inline-flex items-center gap-2 px-4 py-2 btn-brand rounded-lg text-sm font-medium"
              >
                <Plus size={16} />
                Create Document
              </button>
            </div>
          )}

          {/* Shared with me */}
          {shared.documents && shared.documents.length > 0 && (
            <div className="mt-10">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ktip-sand-800 mb-4">
                <Users size={20} className="text-ktip-sand-400" />
                Shared with me
              </h2>
              <div className="space-y-2">
                {shared.documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/collaborate/document/${doc.id}`}
                    className="flex items-center justify-between border border-ktip-sand-200 p-4 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/30 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-ktip-sand-900 group-hover:text-ktip-ocean-700 transition-colors truncate">
                        {doc.title}
                      </h3>
                      <p className="text-sm text-ktip-sand-500 mt-0.5">
                        Edited {formatRelativeTime(doc.updated_at)}
                      </p>
                    </div>
                    {doc.share_permission === 'edit' ? (
                      <span className="text-xs text-ktip-ocean-700 px-2 py-1 bg-ktip-ocean-50 rounded">
                        Can edit
                      </span>
                    ) : (
                      <span className="text-xs text-ktip-sand-400 px-2 py-1 bg-ktip-sand-50 rounded">
                        View only
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
