import type { ForumBoard } from '../../types'
import { BentoCard } from '../ui/BentoCard'
import {
  MessageSquare,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  HelpCircle,
} from 'lucide-react'
import type { ComponentType } from 'react'

const iconMap: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  MessageSquare,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  HelpCircle,
}

interface BoardCardProps {
  board: ForumBoard
}

export function BoardCard({ board }: BoardCardProps) {
  const Icon = iconMap[board.icon || 'MessageSquare'] || MessageSquare

  return (
    <BentoCard
      to={`/forums/${board.slug}`}
      imageSeed={board.id}
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          <Icon size={12} />
          Discussion Board
        </span>
      }
      title={board.name}
      description={board.description}
      cta="Open Board"
    />
  )
}
