import { ChevronDown } from 'lucide-react'
import type { HelpArticle as HelpArticleType } from '../../lib/help-content'

interface HelpArticleProps {
  article: HelpArticleType
  expanded: boolean
  onToggle: () => void
}

export function HelpArticle({ article, expanded, onToggle }: HelpArticleProps) {
  const paragraphs = article.content.split('\n\n')

  return (
    // The id is the scroll target for /help?article=<id> deep links
    <div
      id={`help-${article.id}`}
      className="border border-ktip-sand-100 rounded-xl overflow-hidden transition-colors hover:border-ktip-sand-200"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-medium text-ktip-sand-900 pr-4">{article.title}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ktip-sand-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-1 space-y-3">
            {paragraphs.length > 0 && (
              paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-ktip-sand-700 leading-relaxed">{p}</p>
              ))
            )}

            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {article.tags.slice(0, 5).map((tag) => (
                  <span key={tag} className="text-xs text-ktip-sand-500 bg-ktip-sand-50 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
