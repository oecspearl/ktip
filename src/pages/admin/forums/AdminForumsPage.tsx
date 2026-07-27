import { createSignal, Show, For, Suspense } from 'solid-js'
import { AdminLayout } from '../../../components/layout/AdminLayout'
import { Badge } from '../../../components/ui/Badge'
import { ConfirmModal } from '../../../components/admin/ConfirmModal'
import { useForumBoards } from '../../../hooks/useForums'
import { useDeleteForumPost } from '../../../hooks/useForums'
import { useAdminAllPosts, useAdminForumActions } from '../../../hooks/useAdminDashboard'
import { useToast } from '../../../contexts/ToastContext'
import { cn, debounce } from '../../../lib/utils'
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
} from 'lucide-solid'
import type { Component } from 'solid-js'

const boardIconMap: Record<string, Component<{ size?: number; class?: string }>> = {
  MessageSquare,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  HelpCircle,
  FileText,
}

type Tab = 'boards' | 'posts'

function AdminForumsContent() {
  const toast = useToast()

  // Tab state
  const [activeTab, setActiveTab] = createSignal<Tab>('boards')

  // Posts filters
  const [searchQuery, setSearchQuery] = createSignal('')
  const [debouncedSearch, setDebouncedSearch] = createSignal('')
  const debouncedSetSearch = debounce((val: string) => setDebouncedSearch(val), 300)
  const [boardFilter, setBoardFilter] = createSignal('')

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = createSignal<string | null>(null)

  // Data hooks
  const { boards } = useForumBoards()
  const { posts, refetch: refetchPosts } = useAdminAllPosts({
    get search() { return debouncedSearch() || undefined },
    get boardId() { return boardFilter() || undefined },
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
    const id = deleteTarget()
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
      {/* Dark Header Band */}
      <div class="bg-gray-800 rounded-lg p-6 mb-8">
        <div>
          <p class="text-gray-400 text-xs uppercase tracking-widest mb-1">Administration</p>
          <h1 class="text-2xl font-bold text-white">
            Forum Moderation
          </h1>
          <p class="mt-1 text-gray-400 text-sm">
            Manage forum boards and moderate posts
          </p>
        </div>
      </div>

      {/* Flat Tabs */}
      <div class="border-b border-gray-200 mb-6">
        <div class="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('boards')}
            class={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab() === 'boards'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <MessageSquare size={16} />
            Boards
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('posts')}
            class={cn(
              'flex items-center gap-2 px-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab() === 'posts'
                ? 'border-ktip-ocean-500 text-ktip-ocean-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <FileText size={16} />
            Posts
          </button>
        </div>
      </div>

      {/* Boards Tab */}
      <Show when={activeTab() === 'boards'}>
        <Suspense
          fallback={
            <div class="p-12 text-center text-gray-500">
              Loading boards...
            </div>
          }
        >
          <Show
            when={boards()?.length}
            fallback={
              <div class="p-12 text-center">
                <MessageSquare size={48} class="mx-auto text-gray-300 mb-4" />
                <h3 class="text-lg font-semibold text-gray-700 mb-1">No boards found</h3>
                <p class="text-gray-500 text-sm">
                  Forum boards will appear here once created.
                </p>
              </div>
            }
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <For each={boards()}>
                {(board) => (
                  <div class="border border-gray-200 p-4 rounded-lg">
                    <div class="flex items-start gap-3">
                      <div class="w-10 h-10 rounded-lg bg-ktip-ocean-100 flex items-center justify-center flex-shrink-0">
                        {(() => {
                          const IconComp = boardIconMap[board.icon || 'MessageSquare'] || MessageSquare
                          return <IconComp size={20} class="text-ktip-ocean-600" />
                        })()}
                      </div>
                      <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-gray-900 font-display">
                          {board.name}
                        </h4>
                        <p class="text-sm text-gray-500 mt-1 line-clamp-2">
                          {board.description || 'No description'}
                        </p>
                        <div class="flex items-center gap-3 mt-3 text-xs text-gray-400">
                          <span class="flex items-center gap-1">
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
                )}
              </For>
            </div>
          </Show>
        </Suspense>
      </Show>

      {/* Posts Tab */}
      <Show when={activeTab() === 'posts'}>
        {/* Inline Filter Bar */}
        <div class="mb-6">
          <div class="flex flex-col sm:flex-row gap-3">
            <div class="relative flex-1">
              <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search posts..."
                value={searchQuery()}
                onInput={(e) => {
                  setSearchQuery(e.currentTarget.value)
                  debouncedSetSearch(e.currentTarget.value)
                }}
                class="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none"
              />
            </div>
            <select
              value={boardFilter()}
              onChange={(e) => setBoardFilter(e.currentTarget.value)}
              class="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-ktip-ocean-500 focus:outline-none"
            >
              <option value="">All Boards</option>
              <For each={boards()}>
                {(board) => (
                  <option value={board.id}>{board.name}</option>
                )}
              </For>
            </select>
            <Show when={searchQuery() || boardFilter()}>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setDebouncedSearch('')
                  setBoardFilter('')
                }}
                class="text-sm text-ktip-ocean-600 hover:text-ktip-ocean-700 font-medium whitespace-nowrap"
              >
                Clear all
              </button>
            </Show>
          </div>
        </div>

        {/* Posts Table */}
        <div class="overflow-hidden">
          <Suspense
            fallback={
              <div class="p-12 text-center text-gray-500">
                Loading posts...
              </div>
            }
          >
            <Show
              when={posts()?.length}
              fallback={
                <div class="p-12 text-center">
                  <FileText size={48} class="mx-auto text-gray-300 mb-4" />
                  <h3 class="text-lg font-semibold text-gray-700 mb-1">No posts found</h3>
                  <p class="text-gray-500 text-sm">
                    {searchQuery() || boardFilter()
                      ? 'Try adjusting your filters'
                      : 'Forum posts will appear here once users start posting.'}
                  </p>
                </div>
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead>
                    <tr class="border-b border-gray-200">
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Title
                      </th>
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Board
                      </th>
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Author
                      </th>
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Pinned
                      </th>
                      <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    <For each={posts()}>
                      {(post) => (
                        <tr class="hover:bg-gray-50 transition-colors">
                          <td class="px-4 py-3">
                            <span class="truncate max-w-xs block font-medium text-gray-900 text-sm">
                              {post.title}
                            </span>
                          </td>
                          <td class="px-4 py-3">
                            <span class="text-sm text-gray-700">
                              {post.board?.name || 'Unknown'}
                            </span>
                          </td>
                          <td class="px-4 py-3">
                            <span class="text-sm text-gray-700">
                              {post.author?.display_name || 'Unknown'}
                            </span>
                          </td>
                          <td class="px-4 py-3">
                            <Show
                              when={post.is_pinned}
                              fallback={
                                <span class="text-sm text-gray-400">&mdash;</span>
                              }
                            >
                              <Badge size="sm" variant="primary">
                                Pinned
                              </Badge>
                            </Show>
                          </td>
                          <td class="px-4 py-3">
                            <span class="text-sm text-gray-700">
                              {format(new Date(post.created_at), 'MMM d, yyyy')}
                            </span>
                          </td>
                          <td class="px-4 py-3">
                            <div class="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleTogglePin(post)}
                                class="p-1.5 text-gray-400 hover:text-ktip-ocean-600 transition-colors"
                                title={post.is_pinned ? 'Unpin post' : 'Pin post'}
                              >
                                {post.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(post.id)}
                                class="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete post"
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
      </Show>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget()}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone and will also remove all replies."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteLoading()}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default function AdminForumsPage() {
  return (
    <AdminLayout>
      <AdminForumsContent />
    </AdminLayout>
  )
}
