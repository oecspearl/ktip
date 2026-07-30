import { HelpArticleCard } from './HelpArticleCard'
import { helpIcon } from './help-icons'
import type { HelpCategory as HelpCategoryType } from '../../lib/help-content'

interface HelpCategoryProps {
  category: HelpCategoryType
  expandedArticleId: string | null
  onToggleArticle: (id: string) => void
  onCollapseArticle: () => void
}

export function HelpCategorySection({
  category,
  expandedArticleId,
  onToggleArticle,
  onCollapseArticle,
}: HelpCategoryProps) {
  if (category.articles.length === 0) return null

  const Icon = helpIcon(category.icon)

  return (
    <section className="mb-10 scroll-mt-28" id={`help-category-${category.id}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-ktip-ocean-50 flex items-center justify-center text-ktip-ocean-600 shrink-0">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">{category.title}</h2>
          <p className="text-sm text-ktip-sand-500">{category.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {category.articles.map((article) => (
          <HelpArticleCard
            key={article.id}
            article={article}
            expanded={expandedArticleId === article.id}
            onToggle={() => onToggleArticle(article.id)}
            onCollapse={onCollapseArticle}
          />
        ))}
      </div>
    </section>
  )
}
