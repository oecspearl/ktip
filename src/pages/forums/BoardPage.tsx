import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { PostCard } from '../../components/forums/PostCard'
import { useForumBoard, useForumPosts } from '../../hooks/useForums'
import { Plus, Pencil, Search, MessageCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { PageHero } from '../../components/layout/PageHero'
import { debounce } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'
import { Trans, useLingui } from '@lingui/react/macro'

export default function BoardPage() {
  const { t } = useLingui()
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const { board, loading: boardLoading } = useForumBoard(params.slug)
  usePageTitle(board?.name ? t`${board.name} — Forums` : t`Forums`)

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(
    () => debounce((val: string) => setDebouncedSearch(val), 300),
    []
  )

  const { posts } = useForumPosts(board?.id, { search: debouncedSearch })

  const canEditBoard =
    !!board &&
    (board.created_by && board.created_by === auth.user?.id
      ? auth.can('forum:board')
      : auth.can('forum:manage'))

  if (boardLoading) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-8">
        {/* Stands in for the hero band, so it matches PageHero's hero-base
            (navy by day, near-black at night) rather than a gray that inverts
            to white in dark mode */}
        <div className="bg-hero-base min-h-[180px] rounded-none animate-pulse-soft mb-0" />
        <div className="py-8 space-y-4">
          <div className="h-12 w-64 bg-ktip-sand-100 rounded-lg animate-pulse-soft" />
          <div className="h-24 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
          <div className="h-24 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
          <div className="h-24 bg-ktip-sand-100 rounded-xl animate-pulse-soft" />
        </div>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="w-full max-w-page mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageCircle size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          <Trans>Board Not Found</Trans>
        </h2>
        <p className="text-gray-500 mb-6"><Trans>This forum board doesn't exist.</Trans></p>
        <button
          onClick={() => navigate('/forums')}
          className="px-6 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg"
        >
          <Trans>Back to Forums</Trans>
        </button>
      </div>
    )
  }

  return (
    <>
      <PageHero
        eyebrow={t`Forum Board`}
        title={board.name}
        subtitle={board.description || undefined}
        imageSeed={board.id}
        breadcrumb={[
          { label: t`Home`, href: '/' },
          { label: t`Forums`, href: '/forums' },
          { label: board.name },
        ]}
      />

      {/* === Content Area === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-narrow mx-auto px-4">
          {/* Search + new post */}
          <div
            data-tutorial="board-toolbar"
            className="mb-8 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  debouncedSetSearch(e.target.value)
                }}
                placeholder={t`Search posts...`}
                className="w-full pl-10 pr-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              />
            </div>
            {/* Mirrors 129's UPDATE policy: the board's own creator, or anyone
                holding forum:manage. RLS refuses the rest either way. */}
            {canEditBoard && (
              <Link to={`/forums/${params.slug}/edit`} className="shrink-0">
                <button className="inline-flex items-center gap-2 px-4 py-2.5 border border-ktip-sand-300 bg-ktip-cream text-ktip-sand-700 hover:border-ktip-sand-400 text-sm font-bold uppercase tracking-wider rounded-lg transition-colors">
                  <Pencil size={16} />
                  <Trans>Edit Board</Trans>
                </button>
              </Link>
            )}

            <Link to={`/forums/${params.slug}/new`} className="shrink-0">
              <button className="inline-flex items-center gap-2 px-4 py-2.5 btn-brand text-sm font-bold uppercase tracking-wider rounded-lg">
                <Plus size={16} />
                <Trans>New Post</Trans>
              </button>
            </Link>
          </div>

          {/* Posts List */}
          {posts?.length ? (
            <div data-tutorial="board-posts" className="divide-y divide-ktip-sand-200">
              {posts.map((post) => (
                <div key={post.id} className="py-4">
                  <PostCard post={post} boardSlug={params.slug!} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={32} className="text-gray-400" />
              </div>
              <p className="text-lg font-medium text-ktip-sand-700 mb-2"><Trans>No posts yet</Trans></p>
              <p className="text-sm text-gray-500"><Trans>Start the discussion!</Trans></p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
