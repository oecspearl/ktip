import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { PostCard } from '../../components/forums/PostCard'
import { useForumBoard, useForumPosts } from '../../hooks/useForums'
import { Plus, Search, MessageCircle, ChevronRight } from 'lucide-react'
import { debounce } from '../../lib/utils'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function BoardPage() {
  const params = useParams()
  const navigate = useNavigate()

  const { board, loading: boardLoading } = useForumBoard(params.slug)
  usePageTitle(board?.name ? `${board.name} — Forums` : 'Forums')

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debouncedSetSearch = useMemo(
    () => debounce((val: string) => setDebouncedSearch(val), 300),
    []
  )

  const { posts } = useForumPosts(board?.id, { search: debouncedSearch })

  if (boardLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-gray-800 min-h-[180px] rounded-none animate-pulse-soft mb-0" />
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
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <MessageCircle size={32} className="text-ktip-sand-400" />
        </div>
        <h2 className="text-2xl font-display font-bold uppercase text-ktip-sand-900 mb-2">
          Board Not Found
        </h2>
        <p className="text-gray-500 mb-6">This forum board doesn't exist.</p>
        <button
          onClick={() => navigate('/forums')}
          className="px-6 py-2.5 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors"
        >
          Back to Forums
        </button>
      </div>
    )
  }

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Forum Board</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                {board.name}
              </h1>
              {board.description && (
                <p className="text-gray-300 text-sm">{board.description}</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Link to={`/forums/${params.slug}/new`}>
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-ktip-ocean-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-ktip-ocean-700 transition-colors">
                  <Plus size={16} />
                  New Post
                </button>
              </Link>
              <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
                <Link to="/" className="hover:text-white transition-colors">Home</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                <Link to="/forums" className="hover:text-white transition-colors">Forums</Link>
                <span className="mx-1.5"><ChevronRight size={12} className="inline" /></span>
                <span className="text-gray-300">{board.name}</span>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* === Content Area === */}
      <div className="bg-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          {/* Search */}
          <div className="mb-8">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  debouncedSetSearch(e.target.value)
                }}
                placeholder="Search posts..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm focus:border-ktip-ocean-500 focus:ring-2 focus:ring-ktip-ocean-500/20 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Posts List */}
          {posts?.length ? (
            <div className="divide-y divide-gray-200">
              {posts.map((post) => (
                <div key={post.id} className="py-4">
                  <PostCard post={post} boardSlug={params.slug!} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={32} className="text-gray-400" />
              </div>
              <p className="text-lg font-medium text-ktip-sand-700 mb-2">No posts yet</p>
              <p className="text-sm text-gray-500">Start the discussion!</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
