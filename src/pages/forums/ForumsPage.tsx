import { Link } from 'react-router'
import { BoardCard } from '../../components/forums/BoardCard'
import { useForumBoards } from '../../hooks/useForums'
import { MessageSquare, ChevronRight } from 'lucide-react'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function ForumsPage() {
  usePageTitle('Forums')
  const { boards, loading } = useForumBoards()

  return (
    <>
      {/* === Dark Hero Header Band === */}
      <div className="bg-gray-800 min-h-[180px] flex items-center">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">Community Forums</p>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">Forums</h1>
            </div>
            <nav className="text-sm text-gray-400 hidden md:block" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-white transition-colors">Home</Link>
              <span className="mx-2"><ChevronRight size={12} className="inline" /></span>
              <span className="text-gray-300">Forums</span>
            </nav>
          </div>
        </div>
      </div>

      {/* === Board Grid === */}
      <div className="bg-white py-12">
        <div className="max-w-5xl mx-auto px-4">
          {loading ? (
            <SkeletonGrid count={6} />
          ) : boards?.length ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {boards.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                No forum boards available yet
              </h3>
              <p className="text-gray-500">Check back soon for community discussions.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
