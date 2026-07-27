import {
  Award,
  Rocket,
  Heart,
  Users,
  MessageSquare,
  ShieldCheck,
  Calendar,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from './Badge'
import { formatDate } from '../../lib/utils'
import type { UserBadge } from '../../types'

// icon names stored in badges.icon -> lucide components
const BADGE_ICONS: Record<string, LucideIcon> = {
  award: Award,
  rocket: Rocket,
  heart: Heart,
  users: Users,
  'message-square': MessageSquare,
  'shield-check': ShieldCheck,
  calendar: Calendar,
}

// badges.color -> pill styling
const BADGE_COLORS: Record<string, string> = {
  ocean: 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200',
  tropical: 'bg-ktip-tropical-50 text-ktip-tropical-700 border-ktip-tropical-200',
  sand: 'bg-ktip-sand-50 text-ktip-sand-700 border-ktip-sand-200',
}

interface AchievementBadgeProps {
  userBadge: UserBadge
  size?: 'sm' | 'md'
}

export function AchievementBadge({ userBadge, size }: AchievementBadgeProps) {
  const badge = userBadge.badge
  if (!badge) return null

  const Icon = BADGE_ICONS[badge.icon] || Award
  const colorClass = BADGE_COLORS[badge.color] || BADGE_COLORS.ocean

  return (
    <Badge
      className={colorClass}
      size={size || 'sm'}
      title={`${badge.description} — earned ${formatDate(userBadge.awarded_at)}`}
    >
      <Icon size={size === 'md' ? 14 : 12} />
      {badge.name}
    </Badge>
  )
}
