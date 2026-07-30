import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui/Badge'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { useForumBoards, useDeleteForumPost } from '../../../hooks/useForums'
import { useAdminAllPosts, useAdminForumActions } from '../../../hooks/useAdminDashboard'
import { useToast } from '../../../contexts/ToastContext'
import { cn, debounce } from '../../../lib/utils'
import { PageHero } from '../../../components/layout/PageHero'
import { format } from 'date-fns'
import type { ForumPost } from '../../../types'
import {
  MessageSquare,
  Pin,
  PinOff,
  Trash2,
  Search,
  FileText,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  HelpCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const boardIconMap: Record<string, LucideIcon> = {
  MessageSquare,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  HelpCircle,
  FileText,
}

type Tab = 'boards' | 'posts'

export default function AdminForumsPage() {
  const toast = useToast()

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('boards')

  // Posts filters
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(() => debounce((val: string) => setDebouncedSearch(val), 300), [])
  const [boardFilter, setBoardFilter] = useState('')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Data hooks
  const { boards } = useForumBoards()
  const { posts, refetch: refetchPosts } = useAdminAllPosts({
    search: debouncedSearch || undefined,
    boardId: boardFilter || undefined,
  })
  const { togglePin } = useAdminForumActions()
  const { deletePost, loading: deleteLoading } = useDeleteForumPost()

  const handleTogglePin = async (post: ForumPost) => {
    try {
      await togglePin(post.id, !post.is_pinned)
      toast.success(post.is_pinned ? 'Post unpinned' : 'Post pinned')
      refetchPosts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update pin status')
    }
  }

  const handleDelete = async () => {
    const id = deleteTarget
    if (!id) return
    try {
      await deletePost(id)
      toast.success('Post deleted')
      setDeleteTarget(null)
      refetchPosts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete post')
    }
  }

  return (
    <div>
      <PageHero
        inset
        compact
        eyebrow="Administration"
        title="Forum Moderation"
        subtitle="Manage forum boards and moderate posts"
        imageSeed="admin-forums"
      />

      {/* Flat Tabs */}
      <div className="border-b border-ktip-sand-200 mb-6">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('boards')}
            className={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'boards'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-ktip-sand-300'
            )}
          >
            <MessageSquare size={16} />
            Boards
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('posts')}
            className={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === 'posts'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-ktip-sand-300'
            )}
          >
            <FileText size={16} />
            Posts
          </button>
        </div>
      </div>

      {/* Boards Tab */}
      {activeTab === 'boards' && (
        !boards?.length ? (
          <div className="p-12 text-center">
            <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-1">No boards found</h3>
            <p className="text-gray-500 text-sm">
              Forum boards will appear here once created.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {boards.map((board) => {
              const IconComp = boardIconMap[board.icon || 'MessageSquare'] || MessageSquare
              return (
                <div key={board.id} className="border border-ktip-sand-200 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center flex-shrink-0">
                      <IconComp size={20} className="text-ktip-ocean-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 font-display">
                        {board.name}
                      </h4>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {board.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <FileText size={12} />
                          {board.post_count ?? 0} posts
                        </span>
                        <span>
                          Order: {board.sort_order}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <>
          {/* Inline Filter Bar */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.currentTarget.value)
                    debouncedSetSearch(e.currentTarget.value)
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
                />
              </div>
              <select
                value={boardFilter}
                onChange={(e) => setBoardFilter(e.currentTarget.value)}
                className="px-3 py-2 bg-ktip-cream border border-ktip-sand-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
              >
                <option value="">All Boards</option>
                {(boards || []).map((board) => (
                  <option key={board.id} value={board.id}>{board.name}</option>
                ))}
              </select>
              {(searchQuery || boardFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setDebouncedSearch('')
                    setBoardFilter('')
                  }}
                  className="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Posts Table */}
          <div className="overflow-hidden">
            {!posts?.length ? (
              <div className="p-12 text-center">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-1">No posts found</h3>
                <p className="text-gray-500 text-sm">
                  {searchQuery || boardFilter
                    ? 'Try adjusting your filters'
                    : 'Forum posts will appear here once users start posting.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ktip-sand-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Board
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Author
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Pinned
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ktip-sand-200 stagger-rows">
                    {posts.map((post) => (
                      <tr key={post.id} className="hover:bg-ktip-sand-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="truncate max-w-xs block font-medium text-gray-900 text-sm">
                            {post.title}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {post.board?.name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {post.author?.display_name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {post.is_pinned ? (
                            <Badge size="sm" variant="primary">
                              Pinned
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {format(new Date(post.created_at), 'MMM d, yyyy')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleTogglePin(post)}
                              className="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                              title={post.is_pinned ? 'Unpin post' : 'Pin post'}
                            >
                              {post.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(post.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete post"
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
        </>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone and will also remove all replies."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
