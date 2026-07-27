import {
  Rocket,
  FolderKanban,
  Calendar,
  DollarSign,
  Users,
  MessageSquare,
  FileText,
  Handshake,
  Settings,
  Wrench,
} from 'lucide-react'
import { HelpArticle } from './HelpArticle'
import type { HelpCategory as HelpCategoryType } from '../../lib/help-content'

const ICON_MAP: Record<string, any> = {
  Rocket,
  FolderKanban,
  Calendar,
  DollarSign,
  Users,
  MessageSquare,
  FileText,
  Handshake,
  Settings,
  Wrench,
}

interface HelpCategoryProps {
  category: HelpCategoryType
  expandedArticleId: string | null
  onToggleArticle: (id: string) => void
}

export function HelpCategorySection({ category, expandedArticleId, onToggleArticle }: HelpCategoryProps) {
  if (category.articles.length === 0) return null

  const Icon = ICON_MAP[category.icon] || Rocket

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-ktip-ocean-50 flex items-center justify-center text-ktip-ocean-600">
          <Icon size={20} />
        </div>
        <div>
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">
            {category.title}
          </h2>
          <p className="text-sm text-ktip-sand-500">{category.description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {category.articles.map((article) => (
          <HelpArticle
            key={article.id}
            article={article}
            expanded={expandedArticleId === article.id}
            onToggle={() => onToggleArticle(article.id)}
          />
        ))}
      </div>
    </section>
  )
}
