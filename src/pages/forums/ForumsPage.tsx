import { useMemo } from 'react'
import { Link } from 'react-router'
import { BoardCard } from '../../components/forums/BoardCard'
import { Button } from '../../components/ui/Button'
import { useForumBoards } from '../../hooks/useForums'
import { useAuth } from '../../contexts/AuthContext'
import { MessageSquare, Plus } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { SkeletonGrid } from '../../components/ui/SkeletonCard'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useTutorialAutoStart } from '../../hooks/useTutorialAutoStart'
import { TUTORIAL_IDS } from '../../data/tutorials'
import { VerificationNotice } from '../../components/verification/VerificationNotice'
import { BENTO_GRID, BENTO_TILE, bentoSpans, sortNewestFirst } from '../../lib/bento'
import { Trans, useLingui } from '@lingui/react/macro'

export default function ForumsPage() {
  const { t } = useLingui()
  usePageTitle(t`Forums`)
  const auth = useAuth()
  const { boards, loading } = useForumBoards()
  const canCreateBoard = auth.can('forum:board')

  useTutorialAutoStart(TUTORIAL_IDS.FORUMS, !loading)

  // Newest board leads the bento; sizes/positions follow from the count, so a
  // new board just shifts everything down a slot without touching this file.
  const ordered = useMemo(() => sortNewestFirst(boards || []), [boards])
  const spans = useMemo(() => bentoSpans(ordered.length), [ordered.length])

  return (
    <>
      <PageHero
        eyebrow={t`Community Forums`}
        title={t`Forums`}
        imageSeed="forums"
        breadcrumb={[{ label: t`Home`, href: '/' }, { label: t`Forums` }]}
      />

      {/* === Board Grid === */}
      <div className="bg-ktip-sand-50 py-12">
        <div className="max-w-page-narrow mx-auto px-4">
          {/* Boards are permission-gated (129), so this is the only place the
              forum tells an organisation it may open one. Above the grid rather
              than in the hero — see PageHero's rule about create CTAs. */}
          <VerificationNotice action={t`post and reply`} className="mb-6" />

          {canCreateBoard && (
            <div className="flex justify-end mb-6">
              <Link to="/forums/new">
                <Button icon={<Plus size={16} />} size="sm" className="text-sm">
                  <Trans>Start a Board</Trans>
                </Button>
              </Link>
            </div>
          )}

          {loading ? (
            <SkeletonGrid count={6} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" />
          ) : ordered.length ? (
            <div data-tutorial="forums-boards" className={`${BENTO_GRID} stagger-children`}>
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
              <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={32} className="text-gray-400" />
              </div>
              <h3 className="text-2xl font-display font-bold text-ktip-sand-900 mb-2">
                <Trans>No forum boards available yet</Trans>
              </h3>
              <p className="text-gray-500">
                {canCreateBoard ? (
                  <Trans>Open the first one and give the community somewhere to talk.</Trans>
                ) : (
                  <Trans>Check back soon for community discussions.</Trans>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
