import type { LucideIcon } from 'lucide-react'
import {
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  CheckCircle,
  Code,
  Compass,
  Eye,
  FileText,
  Flame,
  GraduationCap,
  Heart,
  Key,
  Layers,
  Megaphone,
  MessageCircle,
  MessageSquare,
  PenTool,
  Rocket,
  Send,
  Share2,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react'

/**
 * badges.icon holds a kebab-case lucide name; this resolves it to a component.
 *
 * Deliberately separate from `src/lib/icon-map.ts`, which is keyed by PascalCase
 * ('BadgeCheck') because it serves the site map. Badge icon names have been
 * kebab-case since 039 and are stored in the database, so renaming them would
 * mean a data migration for no gain. Two small maps beat one map with two
 * naming conventions in it.
 */
const BADGE_ICONS: Record<string, LucideIcon> = {
  award: Award,
  'book-open': BookOpen,
  calendar: Calendar,
  'calendar-check': CalendarCheck,
  'check-circle': CheckCircle,
  code: Code,
  compass: Compass,
  eye: Eye,
  'file-text': FileText,
  flame: Flame,
  'graduation-cap': GraduationCap,
  heart: Heart,
  key: Key,
  layers: Layers,
  megaphone: Megaphone,
  'message-circle': MessageCircle,
  'message-square': MessageSquare,
  'pen-tool': PenTool,
  rocket: Rocket,
  send: Send,
  'share-2': Share2,
  'shield-check': ShieldCheck,
  'trending-up': TrendingUp,
  'user-check': UserCheck,
  users: Users,
  wallet: Wallet,
}

/** Resolve a badge icon name. Unknown names fall back to a generic medal. */
export function resolveBadgeIcon(name?: string | null): LucideIcon {
  return (name && BADGE_ICONS[name]) || Award
}
