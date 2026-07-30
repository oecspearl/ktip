import {
  Award,
  BookOpen,
  Calendar,
  Compass,
  DollarSign,
  FileText,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Network,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Trophy,
  Users,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// HelpCategory.icon is a lucide name rather than a component so the content
// modules stay free of React imports. Both the sidebar and the section headers
// resolve through here, so a new category needs its icon added in one place.
const HELP_ICONS: Record<string, LucideIcon> = {
  Award,
  BookOpen,
  Calendar,
  Compass,
  DollarSign,
  FileText,
  FolderKanban,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Network,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Trophy,
  Users,
  Wrench,
}

export function helpIcon(name: string): LucideIcon {
  return HELP_ICONS[name] || Rocket
}
