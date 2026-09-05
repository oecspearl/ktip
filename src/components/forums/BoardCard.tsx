import type { ForumBoard } from '../../types'
import { BentoCard } from '../ui/BentoCard'
import { boardIcon } from '../../lib/forum-board-icons'
import { Trans, useLingui } from '@lingui/react/macro'

interface BoardCardProps {
  board: ForumBoard
  /** Bento span/sizing classes from lib/bento.ts. */
  className?: string
}

export function BoardCard({ board, className }: BoardCardProps) {
    const { t } = useLingui()
  const Icon = boardIcon(board.icon)

  return (
    <BentoCard
      to={`/forums/${board.slug}`}
      imageSeed={board.id}
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <Icon size={12} />
          <Trans>Discussion Board</Trans>
        </span>
      }
      title={board.name}
      description={board.description}
      cta={t`Open Board`}
      className={className}
    />
  )
}
