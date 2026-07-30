import { Lock } from 'lucide-react'
import { Badge } from './Badge'
import { cn, formatDate } from '../../lib/utils'
import { resolveBadgeIcon } from '../../lib/badge-icons'
import { RARITY_PILL, TIER_LABEL } from '../../lib/achievement-style'
import type { BadgeDefinition, UserBadge } from '../../types'

// badges.color -> pill styling. All four are OECS brand primitives.
// Sun uses shade 700 for text: index.css warns that yellow and green
// below 700 fail contrast on a light background.
const BADGE_COLORS: Record<string, string> = {
  ocean: 'bg-ktip-ocean-50 text-ktip-ocean-700 border-ktip-ocean-200',
  tropical: 'bg-ktip-tropical-50 text-ktip-tropical-700 border-ktip-tropical-200',
  sand: 'bg-ktip-sand-50 text-ktip-sand-700 border-ktip-sand-200',
  sun: 'bg-ktip-sun-50 text-ktip-sun-700 border-ktip-sun-200',
}

interface AchievementBadgeProps {
  userBadge: UserBadge
  size?: 'sm' | 'md'
  /** Colour the pill by rarity instead of the badge's own colour. */
  byRarity?: boolean
  /** Merged last, so a surface can override shape/spacing (e.g. squarer pills). */
  className?: string
}

/**
 * The compact inline pill: directory cards, the member drawer, profile rows.
 * Artwork-bearing surfaces use TrophyImage / TrophyCard instead.
 */
export function AchievementBadge({ userBadge, size, byRarity, className }: AchievementBadgeProps) {
  const badge = userBadge.badge
  if (!badge) return null

  const Icon = resolveBadgeIcon(badge.icon)
  const colorClass = byRarity
    ? RARITY_PILL[badge.rarity || 'common']
    : BADGE_COLORS[badge.color] || BADGE_COLORS.ocean

  // Tier is part of the identity of a laddered badge ("Innovator, gold"),
  // so it belongs in the accessible name, not only in the artwork.
  const tierSuffix = badge.tier ? ` (${TIER_LABEL[badge.tier]})` : ''

  return (
    <Badge
      className={cn(colorClass, className)}
      size={size || 'sm'}
      title={`${badge.description} — earned ${formatDate(userBadge.awarded_at)}`}
    >
      <Icon size={size === 'md' ? 14 : 12} aria-hidden="true" />
      {badge.name}
      {tierSuffix}
    </Badge>
  )
}

interface LockedBadgeProps {
  badge: BadgeDefinition
  size?: 'sm' | 'md'
}

/**
 * An unearned badge. Rendered muted rather than hidden so the ladder above a
 * member is visible — that visibility is the point of the whole system.
 */
export function LockedAchievementBadge({ badge, size }: LockedBadgeProps) {
  return (
    <Badge
      className="bg-ktip-sand-50 text-ktip-sand-400 border-ktip-sand-200 border-dashed"
      size={size || 'sm'}
      title={`${badge.description} — not yet earned`}
    >
      <Lock size={size === 'md' ? 14 : 12} aria-hidden="true" />
      {badge.name}
    </Badge>
  )
}
