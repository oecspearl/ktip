import { Link } from 'react-router'
import type { ForumBoard } from '../../types'
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
    <Link to={`/forums/${board.slug}`} className="block border border-gray-200 p-6 hover:border-ktip-ocean-400 transition-colors">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-ktip-ocean-50 rounded-lg flex items-center justify-center shrink-0">
          <Icon size={24} className="text-ktip-ocean-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-display font-bold text-ktip-sand-900 mb-1">
            {board.name}
          </h3>
          <p className="text-sm text-gray-600 line-clamp-2">
            {board.description}
          </p>
        </div>
      </div>
    </Link>
  )
}
