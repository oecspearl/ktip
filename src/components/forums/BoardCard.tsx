import { A } from '@solidjs/router'
import type { ForumBoard } from '../../types'
import {
  MessageSquare,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  HelpCircle,
} from 'lucide-solid'
import type { Component } from 'solid-js'

const iconMap: Record<string, Component<{ size?: number; class?: string }>> = {
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

export function BoardCard(props: BoardCardProps) {
  const Icon = () => {
    const IconComponent = iconMap[props.board.icon || 'MessageSquare'] || MessageSquare
    return <IconComponent size={24} class="text-ktip-ocean-500" />
  }

  return (
    <A href={`/forums/${props.board.slug}`} class="block border border-gray-200 p-6 hover:border-ktip-ocean-400 transition-colors">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 bg-ktip-ocean-50 rounded-lg flex items-center justify-center shrink-0">
          <Icon />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-display font-bold text-ktip-sand-900 mb-1">
            {props.board.name}
          </h3>
          <p class="text-sm text-gray-600 line-clamp-2">
            {props.board.description}
          </p>
        </div>
      </div>
    </A>
  )
}
