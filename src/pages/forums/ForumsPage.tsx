import { useMemo } from 'react'
import { BoardCard } from '../../components/forums/BoardCard'
import { useForumBoards } from '../../hooks/useForums'
import { MessageSquare } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'
import { BENTO_GRID, BENTO_TILE, bentoSpans, sortNewestFirst } from '../../lib/bento'

export default function ForumsPage() {
  usePageTitle('Forums')
  const { boards, loading } = useForumBoards()

  // Newest board leads the bento; sizes/positions follow from the count, so a
  // new board just shifts everything down a slot without touching this file.
  const ordered = useMemo(() => sortNewestFirst(boards || []), [boards])
  const spans = useMemo(() => bentoSpans(ordered.length), [ordered.length])

  return (
    <>
      <PageHero
        eyebrow="Community Forums"
        title="Forums"
        imageSeed="forums"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Forums' }]}
      />

      {/* === Board Grid === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          {loading ? (
            <SkeletonGrid count={6} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" />
          ) : ordered.length ? (
            <div className={`${BENTO_GRID} stagger-children`}>
              {ordered.map((board, i) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  className={`${spans[i]} ${BENTO_TILE}`}
                />
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
