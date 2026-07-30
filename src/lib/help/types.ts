import type { UserRole } from '../../types'

export interface HelpArticle {
  id: string
  title: string
  content: string
  tags: string[]
}

export interface HelpCategory {
  id: string
  title: string
  description: string
  /** lucide-react icon name, resolved by `helpIcon()` in components/help/help-icons.ts */
  icon: string
  articles: HelpArticle[]
}

export interface GettingStartedGuide {
  role: UserRole
  title: string
  description: string
  steps: string[]
  quickLinks: { label: string; href: string }[]
}
