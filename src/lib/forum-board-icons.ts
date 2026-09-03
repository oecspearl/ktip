import type { ComponentType } from 'react'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import {
  MessageSquare,
  FolderKanban,
  DollarSign,
  Users,
  Calendar,
  HelpCircle,
  Lightbulb,
  Leaf,
  Landmark,
  BookOpen,
} from 'lucide-react'

export type BoardIconComponent = ComponentType<{ size?: number; className?: string }>

/**
 * The icons a forum board may carry.
 *
 * `forum_boards.icon` stores the lucide component name as text (005 seeded six
 * of them), so the string in the column has to resolve to something on the
 * client. Boards became member-created in 129, which means the value is now
 * chosen in a form rather than written by a migration — this list is what that
 * form offers, and what BoardCard and the admin console read back.
 *
 * Anything not on the list falls back to MessageSquare rather than rendering
 * nothing, so an older or hand-edited row still draws.
 */
export const BOARD_ICONS: { value: string; label: MessageDescriptor; icon: BoardIconComponent }[] = [
  { value: 'MessageSquare', label: msg`Discussion`, icon: MessageSquare },
  { value: 'FolderKanban', label: msg`Projects`, icon: FolderKanban },
  { value: 'DollarSign', label: msg`Funding`, icon: DollarSign },
  { value: 'Users', label: msg`People`, icon: Users },
  { value: 'Calendar', label: msg`Events`, icon: Calendar },
  { value: 'HelpCircle', label: msg`Help`, icon: HelpCircle },
  { value: 'Lightbulb', label: msg`Ideas`, icon: Lightbulb },
  { value: 'Leaf', label: msg`Climate`, icon: Leaf },
  { value: 'Landmark', label: msg`Policy`, icon: Landmark },
  { value: 'BookOpen', label: msg`Learning`, icon: BookOpen },
]

const BY_VALUE = new Map(BOARD_ICONS.map((entry) => [entry.value, entry.icon]))

/** The component for a stored icon name, MessageSquare for anything unknown. */
export function boardIcon(name: string | null | undefined): BoardIconComponent {
  return BY_VALUE.get(name || '') || MessageSquare
}
